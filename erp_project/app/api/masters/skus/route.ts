import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { execute, pool, query } from "@/lib/db"
import { skus as skuSql } from "@/lib/queries/skus"
import { approvalsSql } from "@/lib/queries/approvals"
import { parseS3Import } from "@/lib/import-s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"
import logger from "@/lib/logger"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = {
    requestId: crypto.randomUUID(),
    userId: Number(session.user.id),
    route: "/api/masters/skus",
  }
  logger.info({ ...ctx, message: "SKU API request received" })

  const body = await req.json()
  const { action } = body

  // ── create ──────────────────────────────────────────────────────────────────
  if (action === "create") {
    const { sku_code, name, brand, category, status } = body
    if (!sku_code?.trim() || !name?.trim()) {
      logger.warn({ ...ctx, message: "Validation failed: sku_code and name are required" })
      return NextResponse.json({ error: "sku_code and name are required" }, { status: 400 })
    }

    const eventId = `sku-create-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "SKU_CREATE" }
    logger.info({ ...logCtx, sku_code: sku_code.trim(), name: name.trim(), message: "SKU create started" })
    recordRawEvent("SKU", eventId, { sku_code: sku_code.trim(), name: name.trim(), brand, category, status })

    try {
      const result = await execute(skuSql.insertSku, [
        sku_code.trim(),
        name.trim(),
        brand?.trim() || null,
        category?.trim() || null,
        status || "active",
        Number(session.user.id),
      ])
      recordProcessedEvent("SKU", eventId, { id: result.insertId })
      logger.info({ ...logCtx, id: result.insertId, message: "SKU created" })
      return NextResponse.json({ id: result.insertId })
    } catch (err: any) {
      recordFailedEvent("SKU", eventId, { sku_code: sku_code.trim(), name: name.trim() }, err.message)
      if (err.code === "ER_DUP_ENTRY") {
        logger.warn({ ...logCtx, sku_code: sku_code.trim(), message: "Duplicate SKU code" })
        return NextResponse.json({ error: `SKU code "${sku_code.trim()}" already exists` }, { status: 409 })
      }
      logger.error({ ...logCtx, error: err.message, code: err.code, message: "SKU create failed" })
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  // ── bulk (client-side CSV) ───────────────────────────────────────────────────
  if (action === "bulk") {
    const { rows } = body
    if (!Array.isArray(rows) || rows.length === 0) {
      logger.warn({ ...ctx, message: "Bulk validation failed: no rows provided" })
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }

    const eventId = `sku-bulk-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "SKU_BULK" }
    logger.info({ ...logCtx, rowCount: rows.length, message: "SKU bulk insert started" })
    recordRawEvent("SKU_BULK", eventId, { source: "csv", rowCount: rows.length })

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rows) {
        if (!row.sku_code?.trim() || !row.name?.trim()) continue
        try {
          await conn.execute(skuSql.insertSku, [
            row.sku_code.trim(),
            row.name.trim(),
            row.brand?.trim() || null,
            row.category?.trim() || null,
            row.status || "active",
            Number(session.user.id),
          ])
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") {
            skipped++
          } else {
            throw err
          }
        }
      }
      await conn.commit()
      recordProcessedEvent("SKU_BULK", eventId, { source: "csv", inserted, skipped })
      logger.info({ ...logCtx, inserted, skipped, message: "SKU bulk insert committed" })
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("SKU_BULK", eventId, { source: "csv", rowCount: rows.length }, err.message)
      logger.error({ ...logCtx, error: err.message, code: err.code, message: "SKU bulk insert failed" })
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  // ── update (approval flow) ───────────────────────────────────────────────────
  if (action === "update") {
    const { id, name, brand, category, status } = body
    if (!id || !name?.trim()) {
      logger.warn({ ...ctx, message: "Validation failed: id and name are required" })
      return NextResponse.json({ error: "id and name are required" }, { status: 400 })
    }

    const userId = Number(session.user.id)
    const eventId = `sku-update-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "SKU_UPDATE" }

    const pending = await query(approvalsSql.hasPending, ["SKU", id])
    if (pending.length > 0) {
      logger.warn({ ...logCtx, id, message: "SKU update blocked: pending approval exists" })
      return NextResponse.json(
        { error: "This SKU has a pending approval. Wait for it to be resolved before editing again." },
        { status: 409 }
      )
    }

    logger.info({ ...logCtx, id, name: name.trim(), message: "SKU update (approval) started" })
    recordRawEvent("SKU_UPDATE", eventId, { id, name: name.trim() })

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [rows] = await conn.execute(skuSql.selectById, [id])
      const current = (rows as any[])[0]
      if (!current) {
        await conn.rollback()
        logger.warn({ ...logCtx, id, message: "SKU not found" })
        return NextResponse.json({ error: "SKU not found" }, { status: 404 })
      }

      const proposed: Record<string, string> = {
        name: name.trim(),
        brand: brand?.trim() || "",
        category: category?.trim() || "",
        status: status || "active",
      }
      const diff = Object.entries(proposed).filter(
        ([k, v]) => String(current[k] ?? "") !== String(v ?? "")
      )
      if (diff.length === 0) {
        await conn.rollback()
        logger.info({ ...logCtx, id, message: "SKU update: no changes detected" })
        return NextResponse.json({ ok: true, message: "No changes detected" })
      }

      const [approvalResult] = await conn.execute(approvalsSql.insertApproval, [userId, "SKU", id])
      const approvalId = (approvalResult as any).insertId

      for (const [field, newVal] of diff) {
        await conn.execute(approvalsSql.insertApprovalItem, [
          approvalId,
          field,
          String(current[field] ?? ""),
          String(newVal ?? ""),
        ])
      }

      await conn.execute(skuSql.setStatus, ["in_review", id])
      await conn.commit()

      recordProcessedEvent("SKU_UPDATE", eventId, { id, approvalId })
      logger.info({ ...logCtx, id, approvalId, message: "SKU update submitted for approval" })
      return NextResponse.json({ ok: true, approval_id: approvalId })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("SKU_UPDATE", eventId, { id, name: name.trim() }, err.message)
      logger.error({ ...logCtx, id, error: err.message, code: err.code, message: "SKU update (approval) failed" })
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  // ── bulk_from_s3 ─────────────────────────────────────────────────────────────
  if (action === "bulk_from_s3") {
    const { key } = body
    if (!key?.trim()) {
      logger.warn({ ...ctx, message: "Validation failed: key is required" })
      return NextResponse.json({ error: "key is required" }, { status: 400 })
    }

    const eventId = `sku-s3bulk-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "SKU_S3BULK" }

    let rawRows
    try {
      rawRows = await parseS3Import(key)
    } catch (err: any) {
      logger.error({ ...logCtx, s3Key: key, error: err.message, message: "SKU S3 bulk: failed to parse file" })
      return NextResponse.json({ error: "Failed to parse file: " + err.message }, { status: 400 })
    }

    if (rawRows.length === 0) {
      logger.warn({ ...logCtx, s3Key: key, message: "SKU S3 bulk: file empty or no data rows" })
      return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 })
    }

    logger.info({ ...logCtx, s3Key: key, rowCount: rawRows.length, message: "SKU S3 bulk import started" })
    recordRawEvent("SKU_BULK", eventId, { source: "s3", s3Key: key, rowCount: rawRows.length })

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rawRows) {
        const sku_code = row["sku_code"]?.trim()
        const name = row["name"]?.trim()
        if (!sku_code || !name) continue
        try {
          await conn.execute(skuSql.insertSku, [
            sku_code,
            name,
            row["brand"]?.trim() || null,
            row["category"]?.trim() || null,
            row["status"]?.trim() || "active",
            Number(session.user.id),
          ])
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") { skipped++ } else { throw err }
        }
      }
      await conn.commit()
      recordProcessedEvent("SKU_BULK", eventId, { source: "s3", s3Key: key, inserted, skipped })
      logger.info({ ...logCtx, s3Key: key, inserted, skipped, message: "SKU S3 bulk import committed" })
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("SKU_BULK", eventId, { source: "s3", s3Key: key }, err.message)
      logger.error({ ...logCtx, s3Key: key, error: err.message, code: err.code, message: "SKU S3 bulk import failed" })
      return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  logger.warn({ ...ctx, action, message: "Invalid action" })
  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
