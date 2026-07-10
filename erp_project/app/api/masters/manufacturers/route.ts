// API route for Manufacturers → table `mfgs`.
//
// Called by ManufacturersClient's AddRecordDialog / CsvImportDialog
// (endpoint="/api/masters/manufacturers"). On success the client refreshes the
// page, re-running ManufacturersPage's SELECT.
//
// POST /api/masters/manufacturers
//   Request  { action: "create", name, ... }
//     Process → auto-generate code (MFG-<serial>-<XX>) + INSERT one manufacturer.
//     Response 200 { ok, approval_id } · 400 (validation, via withGateway) · 500 { error }
//
//   Request  { action: "bulk", rows: [{ name, ... }, ...] }
//     Process → auto-generate code (MFG-<serial>-<XX>) per row, INSERT each as in_review,
//       and raise one approval per row — same as single create. All in one transaction.
//     Response 200 { inserted, skipped } · 500 { error }
//
//   Request  { action: "update_docs", mfg_id, gst_certificate_key?, cancelled_cheque_key?, pan_card_key?, misc_document_key? }
//     Process → computes diff of the 4 doc key columns; submits MFG approval (same flow as "update").
//       Files are already uploaded to S3 by the client before calling this endpoint.
//     Response 200 { ok, approval_id } · 409 (pending approval) · 500 { error }
//
// Auth + body validation handled by withGateway (see lib/gateway/with-gateway.ts).
// `mfgs.code` is UNIQUE; the generator retries the next serial on a collision.
import { NextResponse } from "next/server"
import { pool, query } from "@/lib/db"
import { manufacturers } from "@/lib/queries/manufacturers"
import { approvalsSql } from "@/lib/queries/approvals"
import { parseS3Import } from "@/lib/import-s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import logger from "@/lib/logger"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { mfgActionSchema } from "@/lib/validation/manufacturers"
import { insertApprovalWithItems, assertNoDuplicateBankingFields, findDuplicateBankingField } from "@/lib/master-routes/material-utils"

export const POST = withGateway({
  schema: mfgActionSchema,
  handler: async ({ body, session, ctx }) => {
    const userId = Number(session.user.id)

    // ── create (approval flow) ───────────────────────────────────────────────────
    if (body.action === "create") {
      const name = body.name.trim()
      const { location, gst_number, registered_name, zone, bank_name, ifsc_number, account_number, email,
              gst_certificate_key, cancelled_cheque_key, pan_card_key, misc_document_key } = body

      const eventId = makeEventId("MFG", "create")
      const logCtx = { ...ctx, eventId, module: "MFG_CREATE" }
      logger.info({ ...logCtx, name, message: "Manufacturer create started" })
      recordRawEvent("MFG", eventId, { name })

      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        await assertNoDuplicateBankingFields(conn, manufacturers, { gst_number, ifsc_number, account_number }, 0)

        // Auto-generate code as MFG-<serial>-<XX>, XX = first 2 letters of name.
        // Retry with the next serial on a rare collision (concurrent inserts / gaps from deletions).
        const suffix = name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X")
        const [countRows] = await conn.execute(manufacturers.countTotal)
        let serial = (countRows as any[])[0].total as number
        let code = ""
        let mfgId: number
        for (; ; serial++) {
          code = `MFG-${String(serial).padStart(3, "0")}-${suffix}`
          try {
            const [result] = await conn.execute(manufacturers.insert, [code, name])
            mfgId = (result as any).insertId
            break
          } catch (err: any) {
            if (err.code === "ER_DUP_ENTRY") continue
            throw err
          }
        }
        logger.info({ ...logCtx, mfgId, code, message: "Manufacturer created" })

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
        logger.info({ ...logCtx, mfgId, message: "Creating approval record in database" })
        const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "MFG", mfgId, "create"])
        const approvalId = (ar as any).insertId
        const newFields: [string, string][] = [
          ["code", code],
          ["name", name],
          ["registered_name", registered_name?.trim() || ""],
          ["location", location?.trim() || ""],
          ["zone", zone?.trim() || ""],
          ["gst_number", gst_number?.trim() || ""],
          ["bank_name", bank_name?.trim() || ""],
          ["ifsc_number", ifsc_number?.trim() || ""],
          ["account_number", account_number?.trim() || ""],
          ["email", email?.trim() || ""],
          ["gst_certificate_key",  gst_certificate_key  ?? ""],
          ["cancelled_cheque_key", cancelled_cheque_key ?? ""],
          ["pan_card_key",         pan_card_key         ?? ""],
          ["misc_document_key",    misc_document_key    ?? ""],
        ]
        for (const [field, newVal] of newFields) {
          if (newVal) {
            await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, "", newVal])
            logger.debug({ ...logCtx, mfgId, approvalId, field, message: "Approval item inserted" })
          }
        }
        logger.debug({ ...logCtx, mfgId, approvalId, message: "All approval items inserted" })
        await conn.commit()
        logger.info({ ...logCtx, mfgId, approvalId, message: "Transaction committed successfully" })
        recordProcessedEvent("MFG", eventId, { mfgId, approvalId })
        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        logger.warn({ ...logCtx, message: "Transaction rolled back" })
        recordFailedEvent("MFG", eventId, { name }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Manufacturer create failed with unexpected error" })
        throw new ApiError(500, "internal", "Database error")
      } finally {
        conn.release()
      }
    }

    // ── bulk (client-side CSV) ───────────────────────────────────────────────────
    if (body.action === "bulk") {
      const { rows } = body
      const eventId = makeEventId("MFG_BULK", "bulk")
      const logCtx = { ...ctx, eventId, module: "MFG_BULK" }
      logger.info({ ...logCtx, rowCount: rows.length, message: "Manufacturer bulk insert started" })
      recordRawEvent("MFG_BULK", eventId, { source: "csv", rowCount: rows.length })

      const conn = await pool.getConnection()
      await conn.beginTransaction()
      let inserted = 0
      let skipped = 0

      try {
        // Auto-generate code as MFG-<serial>-<XX> for every row, same scheme as
        // single create. `serial` keeps incrementing across rows (successes and
        // collisions alike) so codes never collide within this batch.
        const [countRows] = await conn.execute(manufacturers.countTotal)
        let serial = (countRows as any[])[0].total as number

        for (const row of rows) {
          if (!row.name?.trim()) {
            logger.debug({ ...logCtx, name: row.name, message: "Row skipped — missing name" })
            skipped++
            continue
          }
          const name = row.name.trim()

          const dup = await findDuplicateBankingField(conn, manufacturers, {
            gst_number: row.gst_number, ifsc_number: row.ifsc_number, account_number: row.account_number,
          }, 0)
          if (dup) {
            logger.warn({ ...logCtx, name, message: `Row skipped — ${dup}` })
            skipped++
            continue
          }

          const suffix = name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X")
          let code = ""
          let mfgId: number
          for (; ; serial++) {
            code = `MFG-${String(serial).padStart(3, "0")}-${suffix}`
            try {
              const [result] = await conn.execute(manufacturers.insert, [code, name])
              mfgId = (result as any).insertId
              break
            } catch (err: any) {
              if (err.code === "ER_DUP_ENTRY") continue
              throw err
            }
          }
          await conn.execute(manufacturers.insertDetails, [
            mfgId,
            row.location?.trim() || null,
            row.gst_number?.trim() || null,
            "in_review",
            row.registered_name?.trim() || null,
            row.zone?.trim() || null,
            row.bank_name?.trim() || null,
            row.ifsc_number?.trim() || null,
            row.account_number?.trim() || null,
            row.email?.trim() || null,
          ])
          const approvalId = await insertApprovalWithItems(conn, userId, "MFG", mfgId, [
            ["code", code],
            ["name", name],
            ["registered_name", row.registered_name?.trim() || ""],
            ["location", row.location?.trim() || ""],
            ["zone", row.zone?.trim() || ""],
            ["gst_number", row.gst_number?.trim() || ""],
            ["bank_name", row.bank_name?.trim() || ""],
            ["ifsc_number", row.ifsc_number?.trim() || ""],
            ["account_number", row.account_number?.trim() || ""],
            ["email", row.email?.trim() || ""],
          ])
          logger.debug({ ...logCtx, mfgId, code, approvalId, message: "Row inserted, submitted for approval" })
          inserted++
        }
        await conn.commit()
        logger.info({ ...logCtx, inserted, skipped, message: "Transaction committed successfully" })
        recordProcessedEvent("MFG_BULK", eventId, { source: "csv", inserted, skipped })
        return NextResponse.json({ inserted, skipped })
      } catch (err: any) {
        await conn.rollback()
        logger.warn({ ...logCtx, inserted, skipped, message: "Transaction rolled back" })
        recordFailedEvent("MFG_BULK", eventId, { source: "csv", rowCount: rows.length }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Manufacturer bulk insert failed" })
        throw new ApiError(500, "internal", "Bulk insert failed: " + err.message)
      } finally {
        conn.release()
      }
    }

    // ── check_duplicates (read-only CSV-preview helper) ─────────────────────────
    if (body.action === "check_duplicates") {
      const { rows } = body
      const duplicates: Record<number, string[]> = {}

      const fieldChecks: [string, string, string][] = [
        ["name", manufacturers.checkDuplicateNameBatch, "Name"],
        ["gst_number", manufacturers.checkDuplicateGstBatch, "GST number"],
        ["ifsc_number", manufacturers.checkDuplicateIfscBatch, "IFSC code"],
        ["account_number", manufacturers.checkDuplicateAccountNumberBatch, "Account number"],
        ["email", manufacturers.checkDuplicateEmailBatch, "Email"],
      ]

      for (const [field, sql, label] of fieldChecks) {
        const values = [...new Set(
          rows.map((r: any) => String(r[field] ?? "").trim()).filter(Boolean)
        )]
        if (values.length === 0) continue

        const matches = await query<{ code: string; value: string }>(sql, [values])
        if (matches.length === 0) continue
        const codeByValue = new Map(matches.map((m) => [m.value, m.code]))

        rows.forEach((row: any, i: number) => {
          const val = String(row[field] ?? "").trim()
          const code = val && codeByValue.get(val)
          if (code) {
            ;(duplicates[i] ??= []).push(`${label} "${val}" is already used by ${code}`)
          }
        })
      }

      return NextResponse.json({ duplicates })
    }

    // ── update_docs (approval flow) ──────────────────────────────────────────────
    if (body.action === "update_docs") {
      const { mfg_id, gst_certificate_key, cancelled_cheque_key, pan_card_key, misc_document_key } = body
      const eventId = makeEventId("MFG_DOCS", "docs", mfg_id)
      const logCtx = { ...ctx, eventId, module: "MFG_DOCS" }

      const pending = await query(approvalsSql.hasPending, ["MFG", mfg_id])
      if (pending.length > 0) {
        logger.warn({ ...logCtx, mfg_id, message: "Doc update blocked — pending approval exists" })
        throw new ApiError(409, "pending_approval", "This manufacturer has a pending approval. Wait for it to be resolved before uploading documents.")
      }

      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        const [rows] = await conn.execute(manufacturers.selectById, [mfg_id])
        const current = (rows as any[])[0]
        if (!current) {
          await conn.rollback()
          throw new ApiError(404, "not_found", "Manufacturer not found")
        }

        const proposed: Record<string, string> = {
          gst_certificate_key:  String(gst_certificate_key  ?? ""),
          cancelled_cheque_key: String(cancelled_cheque_key ?? ""),
          pan_card_key:         String(pan_card_key         ?? ""),
          misc_document_key:    String(misc_document_key    ?? ""),
        }

        const diff = Object.entries(proposed).filter(
          ([k, v]) => String(current[k] ?? "") !== v
        )

        if (diff.length === 0) {
          await conn.rollback()
          return NextResponse.json({ ok: true, message: "No changes detected" })
        }

        const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "MFG", mfg_id, "edit"])
        const approvalId = (ar as any).insertId
        for (const [field, newVal] of diff) {
          await conn.execute(approvalsSql.insertApprovalItem, [
            approvalId, field, String(current[field] ?? ""), newVal,
          ])
        }
        await conn.execute(manufacturers.setStatus, ["in_review", mfg_id])
        await conn.commit()

        logger.info({ ...logCtx, mfg_id, approvalId, message: "Manufacturer documents submitted for approval" })
        recordProcessedEvent("MFG_DOCS", eventId, { mfg_id, approvalId })
        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("MFG_DOCS", eventId, { mfg_id: String(mfg_id) }, err.message)
        if (err instanceof ApiError) throw err
        logger.error({ ...logCtx, mfg_id, err: err.message, stack: err.stack, message: "Manufacturer document approval submission failed" })
        throw new ApiError(500, "internal", "Database error")
      } finally {
        conn.release()
      }
    }

    // ── update (approval flow) ───────────────────────────────────────────────────
    if (body.action === "update") {
      const { mfg_id, name, location, gst_number, status, registered_name, zone, bank_name, ifsc_number, account_number, email } = body

      const eventId = makeEventId("MFG_UPDATE", "update", mfg_id)
      const logCtx = { ...ctx, eventId, module: "MFG_UPDATE" }

      const pending = await query(approvalsSql.hasPending, ["MFG", mfg_id])
      if (pending.length > 0) {
        logger.warn({ ...logCtx, mfg_id, message: "Update blocked due to pending approval" })
        throw new ApiError(
          409,
          "pending_approval",
          "This manufacturer has a pending approval. Wait for it to be resolved before editing again."
        )
      }

      const conn = await pool.getConnection()
      logger.info({ ...logCtx, mfg_id, name, message: "Manufacturer update started" })
      recordRawEvent("MFG_UPDATE", eventId, { code: mfg_id, name: name.trim() })

      await conn.beginTransaction()
      try {
        const [rows] = await conn.execute(manufacturers.selectById, [mfg_id])
        const current = (rows as any[])[0]

        if (!current) {
          await conn.rollback()
          logger.warn({ ...logCtx, mfg_id, message: "Manufacturer not found" })
          throw new ApiError(404, "not_found", "Manufacturer not found")
        }

        await assertNoDuplicateBankingFields(conn, manufacturers, { gst_number, ifsc_number, account_number }, Number(mfg_id))

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

        const isDraftResubmit = diff.length === 0 && current.status === "rejected"

        if (diff.length === 0 && !isDraftResubmit) {
          await conn.rollback()
          return NextResponse.json({ ok: true, message: "No changes detected" })
        }
        const [approvalResult] = await conn.execute(approvalsSql.insertApproval, [userId, "MFG", mfg_id, "edit"])
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
        logger.info({ ...logCtx, mfg_id, approvalId, message: "Manufacturer update submitted for approval" })

        recordProcessedEvent("MFG_UPDATE", eventId, { mfg_id, approvalId })
        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("MFG_UPDATE", eventId, { code: String(mfg_id), name: name.trim() }, err.message)
        if (err instanceof ApiError) throw err
        logger.error({ ...logCtx, mfg_id, err: err.message, stack: err.stack, message: "Manufacturer update failed" })
        throw new ApiError(500, "internal", "Database error")
      } finally {
        conn.release()
      }
    }

    // ── bulk_from_s3 ─────────────────────────────────────────────────────────────
    if(body.action === "bulk_from_s3") {
      const { key } = body
      const eventId = makeEventId("MFG_BULK", "bulk-csv")
      const logCtx = { ...ctx, eventId, module: "MFG_BULK" }

      let rawRows
      try {
        rawRows = await parseS3Import(key)
      } catch (err: any) {
        logger.warn({ ...logCtx, message: "Failed to parse the File." })
        throw new ApiError(400, "parse_error", "Failed to parse file: " + err.message)
      }

      if (rawRows.length === 0) {
        logger.debug({ ...logCtx, message: "File is empty or has no data." })
        throw new ApiError(400, "empty_file", "File is empty or has no data rows")
      }
      logger.info({ ...logCtx, rowCount: rawRows.length, message: "MFG bulk update started" })
      recordRawEvent("MFG_BULK", eventId, { source: "s3", s3Key: key, rowCount: rawRows.length })
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      let inserted = 0
      let skipped = 0

      try {
        // Same MFG-<serial>-<XX> auto-generation as the "bulk" (CSV) action above.
        const [countRows] = await conn.execute(manufacturers.countTotal)
        let serial = (countRows as any[])[0].total as number

        for (const row of rawRows) {
          const name = row["name"]?.trim()
          if (!name) {
            logger.debug({ ...logCtx, name: row.name, message: "Row Skipped - Missing Name" })
            skipped++
            continue
          }

          const dup = await findDuplicateBankingField(conn, manufacturers, {
            gst_number: row["gst_number"], ifsc_number: row["ifsc_number"], account_number: row["account_number"],
          }, 0)
          if (dup) {
            logger.warn({ ...logCtx, name, message: `Row skipped — ${dup}` })
            skipped++
            continue
          }

          const suffix = name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X")
          let code = ""
          let mfgId: number
          for (; ; serial++) {
            code = `MFG-${String(serial).padStart(3, "0")}-${suffix}`
            try {
              const [result] = await conn.execute(manufacturers.insert, [code, name])
              mfgId = (result as any).insertId
              break
            } catch (err: any) {
              if (err.code === "ER_DUP_ENTRY") continue
              throw err
            }
          }
          await conn.execute(manufacturers.insertDetails, [
            mfgId,
            row["location"]?.trim() || null,
            row["gst_number"]?.trim() || null,
            "in_review",
            row["registered_name"]?.trim() || null,
            row["zone"]?.trim() || null,
            row["bank_name"]?.trim() || null,
            row["ifsc_number"]?.trim() || null,
            row["account_number"]?.trim() || null,
            row["email"]?.trim() || null,
          ])
          const approvalId = await insertApprovalWithItems(conn, userId, "MFG", mfgId, [
            ["code", code],
            ["name", name],
            ["registered_name", row["registered_name"]?.trim() || ""],
            ["location", row["location"]?.trim() || ""],
            ["zone", row["zone"]?.trim() || ""],
            ["gst_number", row["gst_number"]?.trim() || ""],
            ["bank_name", row["bank_name"]?.trim() || ""],
            ["ifsc_number", row["ifsc_number"]?.trim() || ""],
            ["account_number", row["account_number"]?.trim() || ""],
            ["email", row["email"]?.trim() || ""],
          ])
          logger.debug({ ...logCtx, mfgId, code, approvalId, message: "Row inserted, submitted for approval" })
          inserted++
        }
        await conn.commit()
        logger.info({ ...logCtx, inserted, skipped, message: "Transaction committed successfully" })
        recordProcessedEvent("MFG_BULK", eventId, { source: "s3", s3Key: key, inserted, skipped })
        return NextResponse.json({ inserted, skipped })
      } catch (err: any) {
        await conn.rollback()
        logger.warn({ ...logCtx, inserted, skipped, message: "Transaction rolled back" })
        recordFailedEvent("MFG_BULK", eventId, { source: "s3", s3Key: key }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Manufacturer bulk insert failed" })
        throw new ApiError(500, "internal", "Import failed: " + err.message)
      } finally {
        conn.release()
      }
    }

    logger.warn({...ctx , message: "Invalid action"})
    return NextResponse.json({error:"Invalid action"} , {status : 400})
  },
})
