// API route for Manufacturers → table `mfgs`.
//
// Called by ManufacturersClient's AddRecordDialog / CsvImportDialog
// (endpoint="/api/masters/manufacturers"). On success the client refreshes the
// page, re-running ManufacturersPage's SELECT.
//
// POST /api/masters/manufacturers
//   Request  { action: "create", code, name }
//     Process → INSERT one manufacturer.
//     Response 200 { id } · 400 { error } (missing) · 409 { error } (code exists)
//
//   Request  { action: "bulk", rows: [{ code, name }, ...] }
//     Process → INSERT each row in one transaction; existing codes are skipped.
//     Response 200 { inserted, skipped } · 400 { error } · 500 { error }
//
// Auth: any signed-in user (401 otherwise). `mfgs.code` is UNIQUE, so
// skip-on-duplicate works via ER_DUP_ENTRY.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { pool, query } from "@/lib/db"
import { manufacturers } from "@/lib/queries/manufacturers"
import { approvalsSql } from "@/lib/queries/approvals"
import { parseS3Import } from "@/lib/import-s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"
import logger from "@/lib/logger"
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Logger 
  const ctx = {
    requestId: crypto.randomUUID(),
    userId: session
      ? Number(session.user.id)
      : undefined,
    route: "/api/masters/manufacturers",
  };

  logger.info({
    ...ctx,
    message: "Manufacturer API request received",
  });
  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const { code, name, location, gst_number, registered_name, zone, bank_name, ifsc_number, account_number, email } = body
    if (!code?.trim() || !name?.trim()) {
      logger.warn({ ...ctx, code, name, message: "Validation failed. Code or name missing." });
      return NextResponse.json({ error: "code and name are required" }, { status: 400 })
    }
    const userId = parseInt(session.user.id)
    const eventId = `mfg-new-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "MFG_CREATE" };
    logger.info({ ...logCtx, code, name, message: "Manufacturer create started" });
    recordRawEvent("MFG", eventId, { code: code.trim(), name: name.trim() })
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [result] = await conn.execute(manufacturers.insert, [code.trim(), name.trim()])
      const mfgId = (result as any).insertId
      logger.info({ ...logCtx, mfgId, message: "Manufacturer created" });
      await conn.execute(manufacturers.insertDetails, [
        mfgId,
        location?.trim() || null,
        gst_number?.trim() || null,
        "in_review",
        registered_name?.trim() || null,
        zone?.trim() || null,
        bank_name?.trim() || null,
        ifsc_number?.trim() || null,
        account_number?.trim() || null,
        email?.trim() || null,
      ])
      logger.info({ ...logCtx, mfgId, message: "Creating approval record in database" });
      const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "MFG", mfgId])
      const approvalId = (ar as any).insertId
      const newFields: [string, string][] = [
        ["code", code.trim()],
        ["name", name.trim()],
        ["registered_name", registered_name?.trim() || ""],
        ["location", location?.trim() || ""],
        ["zone", zone?.trim() || ""],
        ["gst_number", gst_number?.trim() || ""],
        ["bank_name", bank_name?.trim() || ""],
        ["ifsc_number", ifsc_number?.trim() || ""],
        ["account_number", account_number?.trim() || ""],
        ["email", email?.trim() || ""],
      ]
      for (const [field, newVal] of newFields) {
        if (newVal) {
          await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, "", newVal])
          logger.debug({ ...logCtx, mfgId, approvalId, field, message: "Approval item inserted" });
        }
      }
      logger.debug({ ...logCtx, mfgId, approvalId, message: "All approval items inserted" });
      await conn.commit()
      logger.info({ ...logCtx, mfgId, approvalId, message: "Transaction committed successfully" });
      recordProcessedEvent("MFG", eventId, { mfgId, approvalId })
      logger.info({ ...logCtx, mfgId, approvalId, message: "Processed event recorded" });
      return NextResponse.json({ ok: true, approval_id: approvalId })
    } catch (err: any) {
      await conn.rollback()
      logger.warn({ ...logCtx, message: "Transaction rolled back" });
      recordFailedEvent("MFG", eventId, { code: code.trim(), name: name.trim() }, err.message)
      if (err.code === "ER_DUP_ENTRY") {
        logger.warn({ ...logCtx, code, message: `Duplicate entry attempted for code "${code.trim()}"` });
        return NextResponse.json({ error: `Code "${code.trim()}" already exists` }, { status: 409 })
      }
      logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Manufacturer create failed with unexpected error" });
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  if (action === "bulk") {
    const { rows } = body
    if (!Array.isArray(rows) || rows.length === 0) {
      logger.warn({ ...ctx, message: "Bulk validation failed. No rows provided." });
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }
    const eventId = `mfg-bulk-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "MFG_BULK" };
    logger.info({ ...logCtx, rowCount: rows.length, message: "Manufacturer bulk insert started" });
    recordRawEvent("MFG_BULK", eventId, { source: "csv", rowCount: rows.length })
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rows) {
        if (!row.code?.trim() || !row.name?.trim()) {
          logger.debug({ ...logCtx, code: row.code, name: row.name, message: "Row skipped — missing code or name" });
          continue
        }
        try {
          const [result] = await conn.execute(manufacturers.insert, [row.code.trim(), row.name.trim()])
          const mfgId = (result as any).insertId
          await conn.execute(manufacturers.insertDetails, [
            mfgId,
            row.location?.trim() || null,
            row.gst_number?.trim() || null,
            row.status || "active",
            row.registered_name?.trim() || null,
            row.zone?.trim() || null,
            row.bank_name?.trim() || null,
            row.ifsc_number?.trim() || null,
            row.account_number?.trim() || null,
            row.email?.trim() || null,
          ])
          logger.debug({ ...logCtx, mfgId, code: row.code.trim(), message: "Row inserted" });
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") {
            logger.debug({ ...logCtx, code: row.code.trim(), message: "Row skipped — duplicate entry" });
            skipped++
          } else {
            throw err
          }
        }
      }
      await conn.commit()
      logger.info({ ...logCtx, inserted, skipped, message: "Transaction committed successfully" });
      recordProcessedEvent("MFG_BULK", eventId, { source: "csv", inserted, skipped })
      logger.info({ ...logCtx, inserted, skipped, message: "Processed event recorded" });
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      logger.warn({ ...logCtx, inserted, skipped, message: "Transaction rolled back" });
      recordFailedEvent("MFG_BULK", eventId, { source: "csv", rowCount: rows.length }, err.message)
      logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Manufacturer bulk insert failed" });
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      logger.debug({ ...logCtx, message: "DB connection released" });
      conn.release()
    }
  }
  if (action === "update") {
    const { mfg_id, name, location, gst_number, status, registered_name, zone, bank_name, ifsc_number, account_number, email,
    } = body

    if (!mfg_id || !name?.trim()) {
      logger.warn({ ...ctx, mfg_id, name, message: "Validation failed. mfg_id or name missing.", })
      return NextResponse.json(
        { error: "mfg_id and name are required" },
        { status: 400 }
      )
    }

    const userId = parseInt(session.user.id)
    const eventId = `mfg-update-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "MFG_UPDATE" }

    const pending = await query(approvalsSql.hasPending, ["MFG", mfg_id])
    if (pending.length > 0) {
      logger.warn({ ...logCtx, mfg_id, message: "Update blocked due to pending approval", })
      return NextResponse.json({
        error: "This manufacturer has a pending approval. Wait for it to be resolved before editing again.",
      }, { status: 409 })
    }

    const conn = await pool.getConnection()
    logger.info({ ...logCtx, mfg_id, name, message: "Manufacturer update started", })
    recordRawEvent("MFG_UPDATE", eventId, {
      code: mfg_id,
      name: name.trim(),
    })

    await conn.beginTransaction()

    try {
      const [rows] = await conn.execute(manufacturers.selectById, [mfg_id])
      const current = (rows as any[])[0]

      if (!current) {
        await conn.rollback()
        logger.debug({ ...logCtx, code: current.code, name: current.name, message: "Manufacturer not found" });
        return NextResponse.json(
          { error: "Manufacturer not found" },
          { status: 404 }
        )
      }

      const proposed: Record<string, string> = {
        name: name.trim(),
        location: location?.trim() || "",
        gst_number: gst_number?.trim() || "",
        registered_name: registered_name?.trim() || "",
        zone: zone?.trim() || "",
        bank_name: bank_name?.trim() || "",
        ifsc_number: ifsc_number?.trim() || "",
        account_number: account_number?.trim() || "",
        email: email?.trim() || "",
        status: status || "active",
      }

      const diff = Object.entries(proposed).filter(
        ([k, v]) => String(current[k] ?? "") !== String(v ?? "")
      )

      const isDraftResubmit = diff.length === 0 && current.status === "draft"

      if (diff.length === 0 && !isDraftResubmit) {
        await conn.rollback()
        return NextResponse.json({
          ok: true,
          message: "No changes detected",
        })
      }
      const [approvalResult] = await conn.execute(approvalsSql.insertApproval, [userId, "MFG", mfg_id])
      const approvalId = (approvalResult as any).insertId
      const itemsToRecord = isDraftResubmit
        ? Object.entries(proposed).filter(([, v]) => v !== "")
        : diff

      for (const [field, newVal] of itemsToRecord) {
        await conn.execute(approvalsSql.insertApprovalItem, [
          approvalId,
          field,
          isDraftResubmit ? "" : String(current[field] ?? ""),
          String(newVal ?? ""),
        ])
      }
      await conn.execute(manufacturers.setStatus, ["in_review", mfg_id])
      await conn.commit()
      logger.info({ ...logCtx, mfg_id, approvalId, message: "Manufacturer update submitted for approval", })

      recordProcessedEvent("MFG_UPDATE", eventId, { mfg_id, approvalId, })

      return NextResponse.json({
        ok: true,
        approval_id: approvalId,
      })
    } catch (err: any) {
      await conn.rollback()
      logger.error({ ...logCtx, mfg_id, err: err.message, stack: err.stack, message: "Manufacturer update failed", })
      recordFailedEvent("MFG_UPDATE", eventId, { code: String(mfg_id), name: name.trim() }, err.message)
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 }
      )
    } finally {
      conn.release()
    }
  }

  if (action === "bulk_from_s3") {
    const { key } = body
    if (!key?.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 })
    const userId = parseInt(session.user.id)
    const eventId = `mfg-bulk-CSV-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "MFG_BULK" }

    let rawRows
    try {
      rawRows = await parseS3Import(key)
    } catch (err: any) {
      logger.warn({ ...logCtx, message: "Failed to parse the File.", })
      return NextResponse.json({ error: "Failed to parse file: " + err.message }, { status: 400 })
    }

    if (rawRows.length === 0) {
      logger.debug({ ...logCtx, message: "File is empty or has no data." })
      return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 })
    }
    logger.info({ ...logCtx, rowCount: rawRows.length, message: "MFG bulk update started" })
    recordRawEvent("MFG_BULK", eventId, { source: "s3", s3Key: key, rowCount: rawRows.length })
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rawRows) {
        const code = row["code"]?.trim()
        const name = row["name"]?.trim()
        if (!code || !name) {
          logger.debug({ ...logCtx, code: row.code, name: row.name, message: "Row Skipped - Mising Code or Name" });
          continue;
        }
        try {
          const [result] = await conn.execute(manufacturers.insert, [code, name])
          const mfgId = (result as any).insertId
          await conn.execute(manufacturers.insertDetails, [
            mfgId,
            row["location"]?.trim() || null,
            row["gst_number"]?.trim() || null,
            row["status"]?.trim() || "active",
            row["registered_name"]?.trim() || null,
            row["zone"]?.trim() || null,
            row["bank_name"]?.trim() || null,
            row["ifsc_number"]?.trim() || null,
            row["account_number"]?.trim() || null,
            row["email"]?.trim() || null,
          ])
          logger.debug({ ...logCtx, mfgId, code: row.code.trim(), message: "Row inserted" })
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") {
            logger.debug({ ...logCtx, code: row.code.trim(), message: "Row skipped — duplicate entry" });
            skipped++
          } else {
            logger.error({ ...logCtx, code: row.code, name: row.name, message: "Some error occured." })
            throw err
          }
        }
      }
      await conn.commit()
      logger.info({ ...logCtx, inserted, skipped, message: "Transaction committed successfully" });
      recordProcessedEvent("MFG_S3BULK", eventId, { source: "s3", s3Key: key, inserted, skipped })
      logger.info({ ...logCtx, inserted, skipped, message: "Processed event recorded" });
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      logger.warn({ ...logCtx, inserted, skipped, message: "Transaction rolled back" });
      recordFailedEvent("MFG_S3BULK", eventId, { source: "s3", s3Key: key }, err.message)
      logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Manufacturer bulk insert failed" });
      return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
