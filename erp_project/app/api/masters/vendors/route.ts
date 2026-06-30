// API route for Vendors → table `vendors`.
//
// Called by VendorsClient's AddRecordDialog / CsvImportDialog
// (endpoint="/api/masters/vendors"). On success the client refreshes the page.
//
// A vendor lives across TWO tables, linked only by id (no DB foreign key):
//   vendors(id, code, name, type)
//   details_vendor(vendor_id → vendors.id, location, status, zone, registered_name)
// So every insert is: INSERT the vendor, read its new id (result.insertId),
// then INSERT the matching details_vendor row — both inside one transaction so
// we never leave a vendor without its details (or vice-versa).
//
// POST /api/masters/vendors
//   Request  { action: "create", code, name, type, location?, status?, zone?, registered_name? }
//     Process → INSERT vendors → INSERT details_vendor(vendor_id = new id).
//     Response 200 { id } (the new vendors.id) · 400 (missing) · 409 (code exists)
//
//   Request  { action: "bulk", rows: [{ code, name, type, location?, ... }, ...] }
//     Process → per row: INSERT vendor + details_vendor; existing codes skipped.
//     Response 200 { inserted, skipped } · 400 { error } · 500 { error }
//
// Auth: any signed-in user (401 otherwise). `vendors.code` is UNIQUE, so
// skip-on-duplicate works. `type` is a NOT NULL enum, so it is required.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { pool, query } from "@/lib/db"
import { vendors } from "@/lib/queries/vendors"
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
    route: "/api/masters/vendors",
  };

  logger.info({
    ...ctx,
    message: "Vendors API request received",
  });

  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const { code, name, type, location, zone, registered_name } = body
    if (!code?.trim() || !name?.trim() || !type?.trim()) {
      logger.warn({ ...ctx, code, name, type, message: "Code, Name and Type are required." })
      return NextResponse.json(
        { error: "code, name and type are required" },
        { status: 400 }
      )
    }
    const userId = parseInt(session.user.id)
    const eventId = `vendor-new-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "VEN_Create" };
    logger.info({ ...logCtx, code, name, type, message: "Vendor Create Started" });
    recordRawEvent("VENDOR", eventId, { code: code.trim(), name: name.trim(), type: type.trim() })
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [vendorResult] = await conn.execute(
        vendors.insertVendor,
        [code.trim(), name.trim(), type.trim()]
      )
      const vendorId = (vendorResult as { insertId: number }).insertId
      logger.info({ ...logCtx, vendorId, message: "Vendor created." });
      await conn.execute(
        vendors.insertVendorDetails,
        [
          vendorId,
          location?.trim() || null,
          "in_review",
          zone?.trim() || null,
          registered_name?.trim() || null,
        ]
      )
      logger.info({ ...logCtx, vendorId, message: "Created approval record in the Database." })
      const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "VENDOR", vendorId])
      const approvalId = (ar as any).insertId

      const newFields: [string, string][] = [
        ["code", code.trim()],
        ["name", name.trim()],
        ["type", type.trim()],
        ["location", location?.trim() || ""],
        ["zone", zone?.trim() || ""],
        ["registered_name", registered_name?.trim() || ""],
      ]
      for (const [field, newVal] of newFields) {
        if (newVal) {
          await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, "", newVal])
          logger.debug({ ...logCtx, vendorId, approvalId, field, message: "Approval item inserted" });
        }
      }
      logger.info({ ...logCtx, vendorId, approvalId, message: "All approval items inserted" })
      await conn.commit()
      logger.info({ ...logCtx, vendorId, approvalId, message: "Transaction committed successfully" });
      recordProcessedEvent("VENDOR", eventId, { vendorId, approvalId })
      logger.info({ ...logCtx, vendorId, approvalId, message: "Processed event recorded" });
      return NextResponse.json({ ok: true, approval_id: approvalId })
    } catch (err: any) {
      await conn.rollback()
      logger.warn({ ...logCtx, message: "Transaction rolled back" })
      recordFailedEvent("VENDOR", eventId, { code: code.trim(), name: name.trim() }, err.message)
      if (err.code === "ER_DUP_ENTRY") {
        logger.warn({ ...logCtx, code, message: `Duplicate entry attempted for code "${code.trim()}"` });
        return NextResponse.json(
          { error: `Code "${code.trim()}" already exists` },
          { status: 409 }
        )
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
      logger.warn({ ...ctx, message: "Bulk Validation Failed. No rows provided." })
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }
    const eventId = `vendor-bulk-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "VENDOR_BULK" }
    logger.info({ ...logCtx, rows: rows.length, message: "Vendor Bulk insert started." });
    recordRawEvent("VENDOR_BULK", eventId, { source: "csv", rowCount: rows.length })
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rows) {
        if (!row.code?.trim() || !row.name?.trim() || !row.type?.trim()) {
          logger.warn({ ...logCtx, code: row.code, name: row.name, type: row.type, message: "Row Skipped - missing name or code" })
          continue;
        }
        try {
          const [vendorResult] = await conn.execute(
            vendors.insertVendor,
            [row.code.trim(), row.name.trim(), row.type.trim()]
          )
          const vendorId = (vendorResult as { insertId: number }).insertId

          await conn.execute(
            vendors.insertVendorDetails,
            [
              vendorId,
              row.location?.trim() || null,
              row.status || "active",
              row.zone?.trim() || null,
              row.registered_name?.trim() || null,
            ]
          )
          logger.debug({ ...logCtx, vendorId, code: row.code.trim(), message: "Row inserted" });
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
      recordProcessedEvent("VENDOR_BULK", eventId, { source: "csv", inserted, skipped })
      logger.info({ ...logCtx, inserted, skipped, message: "Processed event recorded" });
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      logger.warn({ ...logCtx, inserted, skipped, message: "Transaction rolled back" });
      recordFailedEvent("VENDOR_BULK", eventId, { source: "csv", rowCount: rows.length }, err.message)
      logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Vendor bulk insert failed." });
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      logger.debug({ ...logCtx, message: "DB connection released" });
      conn.release()
    }
  }

  if (action === "update") {
    const { vendor_id, name, type, location, status, zone, registered_name } = body
    if (!vendor_id || !name?.trim() || !type?.trim()) {
      return NextResponse.json({ error: "vendor_id, name and type are required" }, { status: 400 })
    }

    const userId = parseInt(session.user.id)
    const eventId = `vendor-update-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "VENDOR_UPDATE" }


    const pending = await query(approvalsSql.hasPending, ["VENDOR", vendor_id])
    if (pending.length > 0) {
      logger.warn({ ...logCtx, vendor_id, name, message: "Validation failed. vendor_id or name missing.", })
      return NextResponse.json(
        { error: "This vendor has a pending approval. Wait for it to be resolved before editing again." },
        { status: 409 }
      )
    }
    recordRawEvent("VENDOR_UPDATE", eventId, {
      code: vendor_id,
      name: name.trim()
    })
    logger.info({ ...logCtx, vendor_id, name, message: "Vendor update started." })
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [rows] = await conn.execute(vendors.selectById, [vendor_id])
      const current = (rows as any[])[0]


      if (!current) {
        await conn.rollback()
        logger.debug({ ...logCtx, name: current.name, code: current.code, message: "Vendor not found" })
        return NextResponse.json({ error: "Vendor not found" }, { status: 404 })
      }

      const proposed: Record<string, string> = {
        name: name.trim(),
        type: type.trim(),
        location: location?.trim() || "",
        zone: zone?.trim() || "",
        registered_name: registered_name?.trim() || "",
        status: status || "active",
      }
      const diff = Object.entries(proposed).filter(
        ([k, v]) => String(current[k] ?? "") !== String(v ?? "")
      )

      const isDraftResubmit = diff.length === 0 && current.status === "draft"
      if (diff.length === 0 && !isDraftResubmit) {
        await conn.rollback()
        return NextResponse.json({ ok: true, message: "No changes detected" })
      }

      const [approvalResult] = await conn.execute(approvalsSql.insertApproval, [userId, "VENDOR", vendor_id])
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

      await conn.execute(vendors.setStatus, ["in_review", vendor_id])

      await conn.commit()
      logger.info({ ...logCtx, vendor_id, approvalId, message: "Vendor update submitted for approval", })
      recordProcessedEvent("VENDOR_UPDATE", eventId, { vendors, approvalId, })

      return NextResponse.json({ ok: true, approval_id: approvalId })
    } catch (err: any) {
      await conn.rollback()
      logger.error({ ...logCtx, vendor_id, err: err.message, stack: err.stack, message: "Manufacturer update failed", })
      recordFailedEvent("VENDOR_UPDATE", eventId, { code: String(vendor_id), name: name.trim() }, err.message)

      return NextResponse.json({ error: "Database error" }, { status: 500 })
    } finally {
      conn.release()
    }
  }
  if (action === "bulk_from_s3") {
    const { key } = body
    if (!key?.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 })
    const eventId = `vendor-bulk-${Date.now()}`
    const logCtx = { ...ctx, eventId, module: "VENDOR_BULK" }

    let rawRows
    try {
      rawRows = await parseS3Import(key)
    } catch (err: any) {
      logger.warn({ ...logCtx, message: "Failed to parse the file" });
      return NextResponse.json({ error: "Failed to parse file: " + err.message }, { status: 400 })
    }

    if (rawRows.length === 0) {
      logger.debug({ ...logCtx, message: "File is empty or has no data rows." })
      return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 })
    }
    logger.info({ ...logCtx, rowCount: rawRows.length, message: "VENDOR BULK UPDATE started." })

    recordRawEvent("VENDOR_BULK", eventId, { source: "s3", s3Key: key, rowCount: rawRows.length })
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rawRows) {
        const code = row["code"]?.trim()
        const name = row["name"]?.trim()
        const type = row["type"]?.trim()
        if (!code || !name || !type) {
          logger.debug({ ...logCtx, code, name, message: "Row Skipped - Missing Code, Name or Type" })
          continue
        }
        try {
          const [vendorResult] = await conn.execute(vendors.insertVendor, [code, name, type])
          const vendorId = (vendorResult as any).insertId
          await conn.execute(vendors.insertVendorDetails, [
            vendorId,
            row["location"]?.trim() || null,
            row["status"]?.trim() || "active",
            row["zone"]?.trim() || null,
            row["registered_name"]?.trim() || null,
          ])
          logger.debug({ ...logCtx, vendorId, code, message: "Row inserted" })

          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") {
            logger.debug({ ...logCtx, code, message: "Row skipped — duplicate entry" })
            skipped++
          } else {
            logger.error({ ...logCtx, code, name, message: "Some error occurred." })
            throw err
          }
        }
      }
      await conn.commit()
      logger.info({ ...logCtx, inserted, skipped, message: "Transaction committed successfully" });
      recordProcessedEvent("VENDOR_BULK", eventId, { source: "s3", s3Key: key, inserted, skipped })
      logger.info({ ...logCtx, inserted, skipped, message: "Processed event VENDOR_BULK recorded" });

      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      logger.warn({ ...logCtx, inserted, skipped, message: "Transaction rolled back" });

      recordFailedEvent("VENDOR_BULK", eventId, { source: "s3", s3Key: key }, err.message)
      logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Vendor bulk insert failed" });
      return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
