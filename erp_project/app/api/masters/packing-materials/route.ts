import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { execute, query, pool } from "@/lib/db"
import { packingMaterials as PMMaterials } from "@/lib/queries/packing-materials"
import { approvalsSql } from "@/lib/queries/approvals"
import { parseS3Import } from "@/lib/import-s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"
import logger from "@/lib/logger"

function toPmParams(r: any) {
  return [
    r.pm_code?.trim() || null,
    r.name.trim(),
    r.type?.trim() || null,
    r.hsn_code?.trim() || null,
    r.uom?.trim() || null,
    r.status || "active",
  ]
}

function toVendorRateParams(pmId: number, r: any) {
  return [
    pmId,
    r.vendor_id ? Number(r.vendor_id) : null,
    r.vendor_code?.trim() || null,
    r.curr_rate ? Number(r.curr_rate) : null,
    r.moq ? Number(r.moq) : null,
    r.rate_uom?.trim() || null,
    r.rate_status || "active",
    r.effective_from?.trim() || null,
    r.effective_to?.trim() || null,
  ]
}


function toMfgRateParams(pmId: number, r: any) {
  return [
    pmId,
    r.mfg_id ? Number(r.mfg_id) : null,
    r.mfg_code?.trim() || null,
    r.curr_rate ? Number(r.curr_rate) : null,
    r.rate_uom?.trim() || null,
    r.rate_status || "active",
    r.effective_from?.trim() || null,
  ]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body
  const ctx = {
    requestId: crypto.randomUUID(),
    userId: session
      ? Number(session.user.id)
      : undefined,
    route: "/api/masters/packing-material",
  };

  logger.info({ ...ctx, message: "Packing Material API request received", });
  const hasVendorRate = !!body.vendor_code?.trim();
  const hasMfgRate = !!body.mfg_code?.trim();
  const rateTab = hasVendorRate ? "vendor" : hasMfgRate ? "manufacturer" : "none";

  // ── Existing flat create (CSV / legacy dialog) ──────────────────────────
  if (action === "create") {
    if (!body.name?.trim()) {
      logger.warn({ ...ctx, message: "PM create rejected: missing name" });
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const eventId = `pm-new-${Date.now()}`;
    const logCtx = { ...ctx, eventId, rateTab };

    logger.info({ ...logCtx, message: "PM create started", name: body.name?.trim(), pm_code: body.pm_code?.trim(), });
    recordRawEvent("PM", eventId, { name: body.name.trim(), pm_code: body.pm_code?.trim() || null })

    if (hasVendorRate || hasMfgRate) {
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      try {
        const [pmResult] = await conn.execute(PMMaterials.insert, toPmParams(body));
        const pmId = (pmResult as any).insertId;

        if (hasVendorRate) {
          await conn.execute(PMMaterials.insertVendorRate, toVendorRateParams(pmId, body));
          logger.info({ ...logCtx, message: "Vendor rate tab: rate inserted", pmId, vendor_code: body.vendor_code?.trim(), });
        } else {
          await conn.execute(PMMaterials.insertMfgRate, toMfgRateParams(pmId, body));
          logger.info({ ...logCtx, message: "Manufacturer tab: rate inserted", pmId, mfg_code: body.mfg_code?.trim(), });
        }

        await conn.commit();
        recordProcessedEvent("PM", eventId, { pmId })
        logger.info({ ...logCtx, message: "PM + rate transaction committed", pmId });
        return NextResponse.json({ id: pmId });
      } catch (err: any) {
        await conn.rollback();
        recordFailedEvent("PM", eventId, { name: body.name.trim() }, err.message)
        logger.error({ ...logCtx, message: `PM + rate insert error (${rateTab} tab)`, error: err.message, code: err.code, });
        return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 });
      } finally {
        conn.release();
      }
    }

    try {
      const result = await execute(PMMaterials.insert, toPmParams(body));
      recordProcessedEvent("PM", eventId, { pmId: result.insertId })
      logger.info({ ...logCtx, message: "PM create succeeded (no rate)", pmId: result.insertId });
      return NextResponse.json({ id: result.insertId });
    } catch (err: any) {
      recordFailedEvent("PM", eventId, { name: body.name.trim() }, err.message)
      if (err.code === "ER_DUP_ENTRY") {
        logger.warn({ ...logCtx, message: "PM create rejected: duplicate pm_code", pm_code: body.pm_code?.trim(), });
        return NextResponse.json(
          { error: `PM code "${body.pm_code?.trim()}" already exists` },
          { status: 409 }
        );
      }
      logger.error({ ...logCtx, message: "PM create error", error: err.message, code: err.code });
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  // ── Wizard step 1: duplicate PM check ───────────────────────────────────
  // Body: { name, type }
  if (action === "check-PM") {
    const { name, type } = body
    const logCtx = { ...ctx, action: "check-PM" }

    if (!name?.trim() || !type?.trim()) {
      logger.warn({ ...logCtx, message: "check-PM rejected: missing name or type" })
      return NextResponse.json({ error: "name and type are required" }, { status: 400 })
    }
    try {
      const rows = await query<{ id: number }>(PMMaterials.checkDuplicate, [
        name.trim(),
        type.trim(),
      ])
      const exists = rows.length > 0
      logger.info({ ...logCtx, message: "check-PM completed", name: name.trim(), type: type.trim(), exists })
      return NextResponse.json({ exists })
    } catch (err: any) {
      logger.error({ ...logCtx, message: "check-PM error", error: err.message, code: err.code })
      console.error("Packing material check error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  // ── Wizard step 2: check if vendor already has a rate for this material ─
  // Body: { name, type, vendor_id }
  // Returns: { exists: false } | { exists: true, existing: { curr_rate, moq, uom } }
  if (action === "check-vendor") {
    const { name, type, vendor_id } = body
    const logCtx = { ...ctx, action: "check-vendor" }

    if (!name?.trim() || !vendor_id) {
      logger.warn({ ...logCtx, message: "check-vendor rejected: missing name or vendor_id" })
      return NextResponse.json({ error: "name and vendor_id are required" }, { status: 400 })
    }
    try {
      const pms = await query<{ id: number }>(PMMaterials.checkDuplicate, [
        name.trim(),
        type?.trim() || "",
      ])
      if (pms.length === 0) {
        logger.info({ ...logCtx, message: "check-vendor: PM not found", name: name.trim() })
        return NextResponse.json({ exists: false })
      }

      const rates = await query<any>(PMMaterials.checkVendorRate, [pms[0].id, Number(vendor_id)])
      if (rates.length === 0) {
        logger.info({ ...logCtx, message: "check-vendor: no existing rate", pmId: pms[0].id, vendor_id: Number(vendor_id) })
        return NextResponse.json({ exists: false })
      }

      const r = rates[0]
      logger.info({ ...logCtx, message: "check-vendor: existing rate found", pmId: pms[0].id, vendor_id: Number(vendor_id), curr_rate: r.curr_rate, moq: r.moq })
      return NextResponse.json({
        exists: true,
        existing: { curr_rate: r.curr_rate, moq: r.moq, uom: r.uom },
      })
    } catch (err: any) {
      logger.error({ ...logCtx, message: "check-vendor error", error: err.message, code: err.code })
      console.error("PM vendor rate check error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  // ── Wizard final submit: create PM + upsert vendor rates + mfg approvals ─
  if (action === "create-full") {
    const { pm } = body
    const vendorList = Array.isArray(body.vendors) ? body.vendors : []
    const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
    const eventId = `mfg-full-${Date.now()}`
    const logCtx = { ...ctx, action: "create-full", eventId }

    if (!pm?.name?.trim()) {
      logger.warn({ ...logCtx, message: "create-full rejected: missing name" })
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    logger.info({ ...logCtx, message: "create-full started", name: pm.name.trim(), type: pm.type?.trim() || null, vendorCount: vendorList.length, mfgCount: mfgList.length })
    recordRawEvent("PM_FULL", eventId, { name: pm.name.trim(), vendorCount: vendorList.length, mfgCount: mfgList.length })

    const today = new Date().toISOString().slice(0, 10)
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [pmResult] = await conn.execute(PMMaterials.insert, [
        null,
        pm.name.trim(),
        pm.type?.trim() || null,
        pm.hsn_code?.trim() || null,
        pm.uom?.trim() || null,
        pm.status || "active",
      ])
      const pmId = (pmResult as any).insertId
      logger.info({ ...logCtx, message: "create-full: PM inserted", pmId })

      // Vendor rates: upsert — archive old rate to vrm_history then update, else insert.
      for (const v of vendorList) {
        const vendorId = v.vendor_id ? Number(v.vendor_id) : null

        const [existingRows] = await conn.execute(PMMaterials.checkVendorRate, [pmId, vendorId])
        const existing = (existingRows as any[])[0]

        if (existing) {
          await conn.execute(PMMaterials.archiveVendorRate, [
            pmId,
            existing.vendor_id,
            existing.curr_rate,
            existing.moq,
            existing.uom,
            existing.effective_from,
            existing.effective_to,
            existing.status,
          ])
          await conn.execute(PMMaterials.updateVendorRate, [
            v.curr_rate ? Number(v.curr_rate) : null,
            v.moq ? Number(v.moq) : null,
            v.rate_uom?.trim() || null,
            "active",
            today,
            existing.id,
          ])
          logger.info({ ...logCtx, message: "create-full: vendor rate archived + updated", pmId, vendor_id: vendorId })
        } else {
          await conn.execute(PMMaterials.insertVendorRate, [
            pmId,
            vendorId,
            v.vendor_code?.trim() || null,
            v.curr_rate ? Number(v.curr_rate) : null,
            v.moq ? Number(v.moq) : null,
            v.rate_uom?.trim() || null,
            "active",
            today,
            null,
          ])
          logger.info({ ...logCtx, message: "create-full: vendor rate inserted", pmId, vendor_id: vendorId })
        }
      }

      // Manufacturer approvals: upsert — update if exists, else insert.
      for (const m of mfgList) {
        const mfgId = m.mfg_id ? Number(m.mfg_id) : null

        const [existingRows] = await conn.execute(PMMaterials.checkMfgRate, [pmId, mfgId])
        const existing = (existingRows as any[])[0]

        if (existing) {
          const [vRows] = await conn.execute(PMMaterials.getVendorId, [pmId])
          const historyVendorId = (vRows as any[])[0]?.vendor_id ?? 0
          await conn.execute(PMMaterials.archiveToHistoryMrm, [
            existing.mfg_id, pmId, historyVendorId, existing.curr_rate,
            existing.effective_from, null, existing.status === "active" ? 1 : 0,
          ])
          await conn.execute(PMMaterials.updateMfgRate, [
            m.curr_rate ? Number(m.curr_rate) : existing.curr_rate,
            m.rate_uom?.trim() || existing.uom,
            today,
            existing.id,
          ])
          logger.info({ ...logCtx, message: "create-full: mfg approval archived + updated", pmId, mfg_id: mfgId })
        } else {
          await conn.execute(PMMaterials.insertMfgApproval, [
            pmId,
            mfgId,
            m.mfg_code?.trim() || null,
            today,
          ])
          logger.info({ ...logCtx, message: "create-full: mfg approval inserted", pmId, mfg_id: mfgId })
        }
      }

      await conn.commit()
      recordProcessedEvent("PM_FULL", eventId, { pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })
      logger.info({ ...logCtx, message: "create-full transaction committed", pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })
      return NextResponse.json({ id: pmId })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("PM_FULL", eventId, { name: pm.name.trim() }, err.message)
      logger.error({ ...logCtx, message: "create-full error", error: err.message, code: err.code })
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  // Add vendor rates and/or mfg approvals to an EXISTING PM (no new pm row inserted).
  // Body: { name, type, vendors: [...], manufacturers: [...] }
  if (action === "add-rates") {
    const { name, type, pm_id } = body
    const vendorList = Array.isArray(body.vendors) ? body.vendors : []
    const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
    const eventId = `mfg-addrates-${Date.now()}`
    const logCtx = { ...ctx, action: "add-rates", eventId }

    if (vendorList.length === 0 && mfgList.length === 0) {
      logger.warn({ ...logCtx, message: "add-rates rejected: no vendors or manufacturers provided" })
      return NextResponse.json({ error: "Provide at least one vendor rate or manufacturer" }, { status: 400 })
    }
    try {
      let pmId: number
      if (pm_id) {
        pmId = Number(pm_id)
      } else {
        if (!name?.trim()) {
          logger.warn({ ...logCtx, message: "add-rates rejected: missing name (no pm_id given)" })
          return NextResponse.json({ error: "name is required" }, { status: 400 })
        }
        const pms = await query<{ id: number }>(PMMaterials.checkDuplicate, [
          name.trim(),
          type?.trim() || "",
        ])
        if (pms.length === 0) {
          logger.warn({ ...logCtx, message: "add-rates: material not found", name: name.trim() })
          return NextResponse.json({ error: "Material not found" }, { status: 404 })
        }
        pmId = pms[0].id
      }

      logger.info({ ...logCtx, message: "add-rates started", pmId, vendorCount: vendorList.length, mfgCount: mfgList.length, })
      recordRawEvent("PM_RATES", logCtx.eventId, { pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })

      const today = new Date().toISOString().slice(0, 10)
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      const userId = parseInt(session.user.id)
      try {
        for (const v of vendorList) {
          const vendorId = v.vendor_id ? Number(v.vendor_id) : null
          const [existingRows] = await conn.execute(PMMaterials.checkVendorRate, [pmId, vendorId])
          const existing = (existingRows as any[])[0]
          if (existing) {
            // Skip if already locked for approval.
            if (existing.status === "in_review") {
              logger.info({ ...logCtx, message: "vendor rate skipped: already in_review", pmId, vendor_id: vendorId, vrmId: existing.id, })
              continue
            }
            // For draft rows, only the original submitter may re-edit.
            if (existing.status === "draft") {
              const [latestRejection] = await query<{ raised_by: number }>(
                approvalsSql.selectLatestRejection, ["PM_VRM", existing.id]
              )
              if (latestRejection && latestRejection.raised_by !== userId) {
                logger.info({ ...logCtx, message: "vendor rate skipped: draft owned by another user", pmId, vendor_id: vendorId, vrmId: existing.id, raisedBy: latestRejection.raised_by, })
                continue
              }
            }
            const pending = await query(approvalsSql.hasPending, ["PM_VRM", existing.id])
            if (pending.length > 0) {
              logger.info({ ...logCtx, message: "vendor rate skipped: pending approval exists", pmId, vendor_id: vendorId, vrmId: existing.id, })
              continue
            }
            const vrmFields: [string, unknown, unknown][] = [
              ["curr_rate", existing.curr_rate, v.curr_rate],
              ["moq", existing.moq, v.moq],
              ["uom", existing.uom, v.rate_uom],
              ["effective_from", existing.effective_from, v.effective_from ?? today],
            ]
            const diff = vrmFields.filter(([, oldVal, newVal]) =>
              String(oldVal ?? "") !== String(newVal ?? "")
            )
            if (diff.length === 0) {
              logger.info({ ...logCtx, message: "vendor rate skipped: no field changes", pmId, vendor_id: vendorId, vrmId: existing.id, })
              continue
            }
            const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PM_VRM", existing.id])
            const approvalId = (ar as any).insertId
            for (const [field, oldVal, newVal] of diff) {
              await conn.execute(approvalsSql.insertApprovalItem, [
                approvalId, field, String(oldVal ?? ""), String(newVal ?? ""),
              ])
            }
            await conn.execute(PMMaterials.setVendorRateStatus, ["in_review", existing.id])
            logger.info({
              ...logCtx, message: "vendor rate approval submitted", pmId, vendor_id: vendorId, vrmId: existing.id, approvalId, changedFields: diff.map(([field]) => field),
            })
          } else {
            await conn.execute(PMMaterials.insertVendorRate, [
              pmId, vendorId, v.vendor_code?.trim() || null,
              v.curr_rate ? Number(v.curr_rate) : null,
              v.moq ? Number(v.moq) : null,
              v.rate_uom?.trim() || null,
              "active", today, null,
            ])
            logger.info({ ...logCtx, message: "vendor rate inserted (new)", pmId, vendor_id: vendorId, })
          }
        }
        for (const m of mfgList) {
          const mfgId = m.mfg_id ? Number(m.mfg_id) : null
          const [existingRows] = await conn.execute(PMMaterials.checkMfgRate, [pmId, mfgId])
          const existing = (existingRows as any[])[0]

          if (existing) {
            // Skip if the rate row is already in_review.
            if (existing.status === "in_review") {
              logger.info({ ...logCtx, message: "mfg rate skipped: already in_review", pmId, mfg_id: mfgId, mrmId: existing.id, })
              continue
            }

            // For draft rows, only the original submitter may re-edit.
            if (existing.status === "draft") {
              const [latestRejection] = await query<{ raised_by: number }>(
                approvalsSql.selectLatestRejection, ["PM_RATE", existing.id]
              )
              if (latestRejection && latestRejection.raised_by !== userId) {
                logger.info({ ...logCtx, message: "mfg rate skipped: draft owned by another user", pmId, mfg_id: mfgId, mrmId: existing.id, raisedBy: latestRejection.raised_by, })
                continue
              }
            }

            // Check for a pending approval against this rate row.
            const pending = await query(approvalsSql.hasPending, ["PM_RATE", existing.id])
            if (pending.length > 0) {
              logger.info({
                ...logCtx, message: "mfg rate skipped: pending approval exists", pmId, mfg_id: mfgId, mrmId: existing.id,
              })
              continue
            }

            // Compute field-level diff for rate fields.
            const rateFields: [string, unknown, unknown][] = [
              ["curr_rate", existing.curr_rate, m.curr_rate],
              ["uom", existing.uom, m.rate_uom],
              ["effective_from", existing.effective_from, m.effective_from ?? today],
            ]
            const diff = rateFields.filter(([, oldVal, newVal]) =>
              String(oldVal ?? "") !== String(newVal ?? "")
            )
            if (diff.length === 0) {
              logger.info({ ...logCtx, message: "mfg rate skipped: no field changes", pmId, mfg_id: mfgId, mrmId: existing.id, })
              continue
            }

            // Create the approval record.
            const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PM_RATE", existing.id])
            const approvalId = (ar as any).insertId
            for (const [field, oldVal, newVal] of diff) {
              await conn.execute(approvalsSql.insertApprovalItem, [
                approvalId, field, String(oldVal ?? ""), String(newVal ?? ""),
              ])
            }

            // Lock the rate row.
            await conn.execute(PMMaterials.setRateStatus, ["in_review", existing.id])
            logger.info({ ...logCtx, message: "mfg rate approval submitted", pmId, mfg_id: mfgId, mrmId: existing.id, approvalId, changedFields: diff.map(([field]) => field) })
          } else {
            await conn.execute(PMMaterials.insertMfgApproval, [pmId, mfgId, m.mfg_code?.trim() || null, today])
            logger.info({ ...logCtx, message: "mfg rate inserted (new)", pmId, mfg_id: mfgId })
          }
        }
        await conn.commit()
        recordProcessedEvent("PM_RATES", logCtx.eventId, { pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })
        logger.info({ ...logCtx, message: "add-rates transaction committed", pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })
        return NextResponse.json({ pmId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("PM_RATES", logCtx.eventId, { pmId }, err.message)
        logger.error({ ...logCtx, message: "add-rates transaction error", pmId, error: err.message, code: err.code, })
        return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
      } finally {
        conn.release()
      }
    } catch (err: any) {
      logger.error({ ...logCtx, message: "add-rates lookup error", error: err.message, code: err.code })
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  // ── CSV bulk import ──────────────────────────────────────────────────────
  if (action === "bulk") {
    const { rows } = body
    const eventId = `mfg-bulk-${Date.now()}`
    const logCtx = { ...ctx, action: "bulk", eventId }

    if (!Array.isArray(rows) || rows.length === 0) {
      logger.warn({ ...logCtx, message: "Bulk insert rejected: no rows provided" })
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }

    logger.info({ ...logCtx, message: "Bulk insert started", rowCount: rows.length })
    recordRawEvent("PM_BULK", eventId, { source: "csv", rowCount: rows.length })

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0
    let invalid = 0

    try {
      for (const [index, row] of rows.entries()) {
        if (!row.name?.trim()) {
          invalid++
          logger.warn({ ...logCtx, message: "Bulk row skipped: missing name", rowIndex: index })
          continue
        }
        try {
          await conn.execute(PMMaterials.insert, toPmParams(row))
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") {
            skipped++
            logger.info({ ...logCtx, message: "Bulk row skipped: duplicate", rowIndex: index, name: row.name?.trim() })
          } else {
            throw err
          }
        }
      }
      await conn.commit()
      recordProcessedEvent("PM_BULK", eventId, { source: "csv", inserted, skipped })
      logger.info({ ...logCtx, message: "Bulk insert committed", rowCount: rows.length, inserted, skipped, invalid })
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("PM_BULK", eventId, { source: "csv", rowCount: rows.length }, err.message)
      logger.error({  ...logCtx,  message: "Bulk insert error",  error: err.message,  code: err.code,  inserted,  skipped  })
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  // Bulk import while storing in s3 bucket.
  if (action === "bulk_from_s3") {
    const { key } = body
    const eventId = `mfg-bulk-s3-${Date.now()}`
    const logCtx = { ...ctx, action: "bulk_from_s3", eventId, s3Key: key?.trim() }
    if (!key?.trim()) {
      logger.warn({ ...logCtx, message: "bulk_from_s3 rejected: missing key" })
      return NextResponse.json({ error: "key is required" }, { status: 400 })
    }
    recordRawEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key, rowCount: null })

    let rawRows
    try {
      rawRows = await parseS3Import(key)
    } catch (err: any) {
      recordFailedEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key }, err.message)
      logger.error({ ...logCtx, message: "bulk_from_s3: failed to parse file", error: err.message })
      return NextResponse.json({ error: "Failed to parse file: " + err.message }, { status: 400 })
    }

    if (rawRows.length === 0) {
      recordFailedEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key, rowCount: 0 }, "File is empty or has no data rows")
      logger.warn({ ...logCtx, message: "bulk_from_s3: file empty or no data rows" })
      return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 })
    }

    logger.info({ ...logCtx, message: "bulk_from_s3 started", rowCount: rawRows.length })

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0
    let invalid = 0

    try {
      for (const [index, row] of rawRows.entries()) {
        if (!row["name"]?.trim()) {
          invalid++
          logger.warn({ ...logCtx, message: "bulk_from_s3 row skipped: missing name", rowIndex: index })
          continue
        }
        try {
          await conn.execute(PMMaterials.insert, toPmParams(row))
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") {
            skipped++
            logger.info({ ...logCtx, message: "bulk_from_s3 row skipped: duplicate", rowIndex: index, name: row["name"]?.trim() })
          } else {
            throw err
          }
        }
      }
      await conn.commit()
      recordProcessedEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key, inserted, skipped })
      logger.info({ ...logCtx, message: "bulk_from_s3 committed", rowCount: rawRows.length, inserted, skipped, invalid })
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key }, err.message)
      logger.error({ ...logCtx, message: "bulk_from_s3 import failed", error: err.message, code: err.code, inserted, skipped, })
      return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}