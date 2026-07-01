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
//   Request  { action: "create", name, type, location?, zone?, registered_name? }
//     Process → auto-generate code (VEN-<serial>-<XX>) + INSERT vendors → INSERT details_vendor(vendor_id = new id).
//     Response 200 { ok, approval_id } · 400 (validation, via withGateway) · 500 { error }
//
//   Request  { action: "bulk", rows: [{ name, type, location?, ... }, ...] }
//     Process → auto-generate code (VEN-<serial>-<XX>) per row, INSERT vendor + details_vendor
//       as in_review, and raise one approval per row — same as single create.
//     Response 200 { inserted, skipped } · 500 { error }
//
// Auth + body validation handled by withGateway (see lib/gateway/with-gateway.ts).
// `vendors.code` is UNIQUE; the generator retries the next serial on a collision. `type` is a NOT NULL enum, so it is required.
import { NextResponse } from "next/server"
import { pool, query } from "@/lib/db"
import { vendors } from "@/lib/queries/vendors"
import { approvalsSql } from "@/lib/queries/approvals"
import { parseS3Import } from "@/lib/import-s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"
import logger from "@/lib/logger"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { vendorActionSchema } from "@/lib/validation/vendors"
import { insertApprovalWithItems } from "@/lib/master-routes/material-utils"

export const POST = withGateway({
  schema: vendorActionSchema,
  handler: async ({ body, session, ctx }) => {
    const userId = Number(session.user.id)

    // ── create (approval flow) ───────────────────────────────────────────────────
    if (body.action === "create") {
      const name = body.name.trim()
      const type = body.type.trim()
      const { location, zone, registered_name } = body

      const eventId = `vendor-new-${Date.now()}`
      const logCtx = { ...ctx, eventId, module: "VEN_Create" }
      logger.info({ ...logCtx, name, type, message: "Vendor Create Started" })
      recordRawEvent("VENDOR", eventId, { name, type })

      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        // Auto-generate code as VEN-<serial>-<XX>, XX = first 2 letters of name.
        // Retry with the next serial on a rare collision (concurrent inserts / gaps from deletions).
        const suffix = name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X")
        const [countRows] = await conn.execute(vendors.countTotal)
        let serial = (countRows as any[])[0].total as number
        let code = ""
        let vendorId: number
        for (; ; serial++) {
          code = `VEN-${String(serial).padStart(3, "0")}-${suffix}`
          try {
            const [vendorResult] = await conn.execute(vendors.insertVendor, [code, name, type])
            vendorId = (vendorResult as { insertId: number }).insertId
            break
          } catch (err: any) {
            if (err.code === "ER_DUP_ENTRY") continue
            throw err
          }
        }
        logger.info({ ...logCtx, vendorId, code, message: "Vendor created." })
        await conn.execute(vendors.insertVendorDetails, [
          vendorId,
          location?.trim() || null,
          "in_review",
          zone?.trim() || null,
          registered_name?.trim() || null,
        ])
        logger.info({ ...logCtx, vendorId, message: "Created approval record in the Database." })
        const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "VENDOR", vendorId])
        const approvalId = (ar as any).insertId

        const newFields: [string, string][] = [
          ["code", code],
          ["name", name],
          ["type", type],
          ["location", location?.trim() || ""],
          ["zone", zone?.trim() || ""],
          ["registered_name", registered_name?.trim() || ""],
        ]
        for (const [field, newVal] of newFields) {
          if (newVal) {
            await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, "", newVal])
            logger.debug({ ...logCtx, vendorId, approvalId, field, message: "Approval item inserted" })
          }
        }
        logger.info({ ...logCtx, vendorId, approvalId, message: "All approval items inserted" })
        await conn.commit()
        logger.info({ ...logCtx, vendorId, approvalId, message: "Transaction committed successfully" })
        recordProcessedEvent("VENDOR", eventId, { vendorId, approvalId })
        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        logger.warn({ ...logCtx, message: "Transaction rolled back" })
        recordFailedEvent("VENDOR", eventId, { name }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Vendor create failed with unexpected error" })
        throw new ApiError(500, "internal", "Database error")
      } finally {
        conn.release()
      }
    }

    // ── bulk (client-side CSV) ───────────────────────────────────────────────────
    if (body.action === "bulk") {
      const { rows } = body
      const eventId = `vendor-bulk-${Date.now()}`
      const logCtx = { ...ctx, eventId, module: "VENDOR_BULK" }
      logger.info({ ...logCtx, rows: rows.length, message: "Vendor Bulk insert started." })
      recordRawEvent("VENDOR_BULK", eventId, { source: "csv", rowCount: rows.length })

      const conn = await pool.getConnection()
      await conn.beginTransaction()
      let inserted = 0
      let skipped = 0

      try {
        // Auto-generate code as VEN-<serial>-<XX>, same scheme as manufacturers.
        // `serial` keeps incrementing across rows so codes never collide within this batch.
        const [countRows] = await conn.execute(vendors.countTotal)
        let serial = (countRows as any[])[0].total as number

        for (const row of rows) {
          if (!row.name?.trim() || !row.type?.trim()) {
            logger.warn({ ...logCtx, name: row.name, type: row.type, message: "Row Skipped - missing name or type" })
            continue
          }
          const name = row.name.trim()
          const type = row.type.trim()
          const suffix = name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X")
          let code = ""
          let vendorId: number
          for (; ; serial++) {
            code = `VEN-${String(serial).padStart(3, "0")}-${suffix}`
            try {
              const [vendorResult] = await conn.execute(vendors.insertVendor, [code, name, type])
              vendorId = (vendorResult as { insertId: number }).insertId
              break
            } catch (err: any) {
              if (err.code === "ER_DUP_ENTRY") continue
              throw err
            }
          }
          await conn.execute(vendors.insertVendorDetails, [
            vendorId,
            row.location?.trim() || null,
            "in_review",
            row.zone?.trim() || null,
            row.registered_name?.trim() || null,
          ])
          const approvalId = await insertApprovalWithItems(conn, userId, "VENDOR", vendorId, [
            ["code", code],
            ["name", name],
            ["type", type],
            ["location", row.location?.trim() || ""],
            ["zone", row.zone?.trim() || ""],
            ["registered_name", row.registered_name?.trim() || ""],
          ])
          logger.debug({ ...logCtx, vendorId, code, approvalId, message: "Row inserted, submitted for approval" })
          inserted++
        }
        await conn.commit()
        logger.info({ ...logCtx, inserted, skipped, message: "Transaction committed successfully" })
        recordProcessedEvent("VENDOR_BULK", eventId, { source: "csv", inserted, skipped })
        return NextResponse.json({ inserted, skipped })
      } catch (err: any) {
        await conn.rollback()
        logger.warn({ ...logCtx, inserted, skipped, message: "Transaction rolled back" })
        recordFailedEvent("VENDOR_BULK", eventId, { source: "csv", rowCount: rows.length }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Vendor bulk insert failed." })
        throw new ApiError(500, "internal", "Bulk insert failed: " + err.message)
      } finally {
        logger.debug({ ...logCtx, message: "DB connection released" })
        conn.release()
      }
    }

    // ── update (approval flow) ───────────────────────────────────────────────────
    if (body.action === "update") {
      const { vendor_id, name, type, location, status, zone, registered_name } = body

      const eventId = `vendor-update-${Date.now()}`
      const logCtx = { ...ctx, eventId, module: "VENDOR_UPDATE" }

      const pending = await query(approvalsSql.hasPending, ["VENDOR", vendor_id])
      if (pending.length > 0) {
        logger.warn({ ...logCtx, vendor_id, name, message: "Update blocked due to pending approval" })
        throw new ApiError(
          409,
          "pending_approval",
          "This vendor has a pending approval. Wait for it to be resolved before editing again."
        )
      }
      recordRawEvent("VENDOR_UPDATE", eventId, { code: vendor_id, name: name.trim() })
      logger.info({ ...logCtx, vendor_id, name, message: "Vendor update started." })
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        const [rows] = await conn.execute(vendors.selectById, [vendor_id])
        const current = (rows as any[])[0]

        if (!current) {
          await conn.rollback()
          logger.warn({ ...logCtx, vendor_id, message: "Vendor not found" })
          throw new ApiError(404, "not_found", "Vendor not found")
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
        logger.info({ ...logCtx, vendor_id, approvalId, message: "Vendor update submitted for approval" })
        recordProcessedEvent("VENDOR_UPDATE", eventId, { vendor_id, approvalId })

        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("VENDOR_UPDATE", eventId, { code: String(vendor_id), name: name.trim() }, err.message)
        if (err instanceof ApiError) throw err
        logger.error({ ...logCtx, vendor_id, err: err.message, stack: err.stack, message: "Vendor update failed" })
        throw new ApiError(500, "internal", "Database error")
      } finally {
        conn.release()
      }
    }

    // ── bulk_from_s3 ─────────────────────────────────────────────────────────────
    if(body.action === "bulk_from_s3") {
      const { key } = body
      const eventId = `vendor-bulk-${Date.now()}`
      const logCtx = { ...ctx, eventId, module: "VENDOR_BULK" }

      let rawRows
      try {
        rawRows = await parseS3Import(key)
      } catch (err: any) {
        logger.warn({ ...logCtx, message: "Failed to parse the file" })
        throw new ApiError(400, "parse_error", "Failed to parse file: " + err.message)
      }

      if (rawRows.length === 0) {
        logger.debug({ ...logCtx, message: "File is empty or has no data rows." })
        throw new ApiError(400, "empty_file", "File is empty or has no data rows")
      }
      logger.info({ ...logCtx, rowCount: rawRows.length, message: "VENDOR BULK UPDATE started." })

      recordRawEvent("VENDOR_BULK", eventId, { source: "s3", s3Key: key, rowCount: rawRows.length })
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      let inserted = 0
      let skipped = 0

      try {
        // Same VEN-<serial>-<XX> auto-generation as the "bulk" (CSV) action above.
        const [countRows] = await conn.execute(vendors.countTotal)
        let serial = (countRows as any[])[0].total as number

        for (const row of rawRows) {
          const name = row["name"]?.trim()
          const type = row["type"]?.trim()
          if (!name || !type) {
            logger.debug({ ...logCtx, name, message: "Row Skipped - Missing Name or Type" })
            continue
          }
          const suffix = name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X")
          let code = ""
          let vendorId: number
          for (; ; serial++) {
            code = `VEN-${String(serial).padStart(3, "0")}-${suffix}`
            try {
              const [vendorResult] = await conn.execute(vendors.insertVendor, [code, name, type])
              vendorId = (vendorResult as any).insertId
              break
            } catch (err: any) {
              if (err.code === "ER_DUP_ENTRY") continue
              throw err
            }
          }
          await conn.execute(vendors.insertVendorDetails, [
            vendorId,
            row["location"]?.trim() || null,
            "in_review",
            row["zone"]?.trim() || null,
            row["registered_name"]?.trim() || null,
          ])
          const approvalId = await insertApprovalWithItems(conn, userId, "VENDOR", vendorId, [
            ["code", code],
            ["name", name],
            ["type", type],
            ["location", row["location"]?.trim() || ""],
            ["zone", row["zone"]?.trim() || ""],
            ["registered_name", row["registered_name"]?.trim() || ""],
          ])
          logger.debug({ ...logCtx, vendorId, code, approvalId, message: "Row inserted, submitted for approval" })
          inserted++
        }
        await conn.commit()
        logger.info({ ...logCtx, inserted, skipped, message: "Transaction committed successfully" })
        recordProcessedEvent("VENDOR_BULK", eventId, { source: "s3", s3Key: key, inserted, skipped })

        return NextResponse.json({ inserted, skipped })
      } catch (err: any) {
        await conn.rollback()
        logger.warn({ ...logCtx, inserted, skipped, message: "Transaction rolled back" })

        recordFailedEvent("VENDOR_BULK", eventId, { source: "s3", s3Key: key }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Vendor bulk insert failed" })
        throw new ApiError(500, "internal", "Import failed: " + err.message)
      } finally {
        conn.release()
      }
    }

    logger.warn({...ctx , message: "Invalid action"})
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }
})
