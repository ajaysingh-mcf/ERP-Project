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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const { code, name, location, gst_number, registered_name, zone, bank_name, ifsc_number, account_number, email } = body
    if (!code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "code and name are required" }, { status: 400 })
    }
    const userId = parseInt(session.user.id)
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [result] = await conn.execute(manufacturers.insert, [code.trim(), name.trim()])
      const mfgId = (result as any).insertId
      await conn.execute(manufacturers.insertDetails, [
        mfgId,
        location?.trim()        || null,
        gst_number?.trim()      || null,
        "in_review",
        registered_name?.trim() || null,
        zone?.trim()            || null,
        bank_name?.trim()       || null,
        ifsc_number?.trim()     || null,
        account_number?.trim()  || null,
        email?.trim()           || null,
      ])

      const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "MFG", mfgId])
      const approvalId = (ar as any).insertId

      const newFields: [string, string][] = [
        ["code",            code.trim()],
        ["name",            name.trim()],
        ["registered_name", registered_name?.trim() || ""],
        ["location",        location?.trim()        || ""],
        ["zone",            zone?.trim()            || ""],
        ["gst_number",      gst_number?.trim()      || ""],
        ["bank_name",       bank_name?.trim()       || ""],
        ["ifsc_number",     ifsc_number?.trim()     || ""],
        ["account_number",  account_number?.trim()  || ""],
        ["email",           email?.trim()           || ""],
      ]
      for (const [field, newVal] of newFields) {
        if (newVal) {
          await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, "", newVal])
        }
      }

      await conn.commit()
      return NextResponse.json({ ok: true, approval_id: approvalId })
    } catch (err: any) {
      await conn.rollback()
      if (err.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: `Code "${code.trim()}" already exists` },
          { status: 409 }
        )
      }
      console.error("Manufacturer create error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  if (action === "bulk") {
    const { rows } = body
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rows) {
        if (!row.code?.trim() || !row.name?.trim()) continue
        try {
          const [result] = await conn.execute(manufacturers.insert, [row.code.trim(), row.name.trim()])
          const mfgId = (result as any).insertId
          await conn.execute(manufacturers.insertDetails, [
            mfgId,
            row.location?.trim()        || null,
            row.gst_number?.trim()      || null,
            row.status                  || "active",
            row.registered_name?.trim() || null,
            row.zone?.trim()            || null,
            row.bank_name?.trim()       || null,
            row.ifsc_number?.trim()     || null,
            row.account_number?.trim()  || null,
            row.email?.trim()           || null,
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
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      console.error("Manufacturer bulk insert error:", err)
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }
  if (action === "update") {
    const { mfg_id, name, location, gst_number, status, registered_name, zone, bank_name, ifsc_number, account_number, email } = body
    if (!mfg_id || !name?.trim()) {
      return NextResponse.json({ error: "mfg_id and name are required" }, { status: 400 })
    }

    const userId = parseInt(session.user.id)

    const pending = await query(approvalsSql.hasPending, ["MFG", mfg_id])
    if (pending.length > 0) {
      return NextResponse.json(
        { error: "This manufacturer has a pending approval. Wait for it to be resolved before editing again." },
        { status: 409 }
      )
    }

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [rows] = await conn.execute(manufacturers.selectById, [mfg_id])
      const current = (rows as any[])[0]
      if (!current) {
        await conn.rollback()
        return NextResponse.json({ error: "Manufacturer not found" }, { status: 404 })
      }

      const proposed: Record<string, string> = {
        name:            name.trim(),
        location:        location?.trim() || "",
        gst_number:      gst_number?.trim() || "",
        registered_name: registered_name?.trim() || "",
        zone:            zone?.trim() || "",
        bank_name:       bank_name?.trim() || "",
        ifsc_number:     ifsc_number?.trim() || "",
        account_number:  account_number?.trim() || "",
        email:           email?.trim() || "",
        status:          status || "active",
      }
      const diff = Object.entries(proposed).filter(
        ([k, v]) => String(current[k] ?? "") !== String(v ?? "")
      )

      // A rejected new-record creation leaves the record in 'draft' with the
      // correct values already in DB. If the submitter resubmits unchanged we
      // still need to create an approval, so use all proposed fields as items.
      const isDraftResubmit = diff.length === 0 && current.status === "draft"
      if (diff.length === 0 && !isDraftResubmit) {
        await conn.rollback()
        return NextResponse.json({ ok: true, message: "No changes detected" })
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
      return NextResponse.json({ ok: true, approval_id: approvalId })
    } catch (err: any) {
      await conn.rollback()
      console.error("[Mfg] update (approval) mfg_id=%d error=%s", mfg_id, err.message)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  if (action === "bulk_from_s3") {
    const { key } = body
    if (!key?.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 })

    let rawRows
    try {
      rawRows = await parseS3Import(key)
    } catch (err: any) {
      return NextResponse.json({ error: "Failed to parse file: " + err.message }, { status: 400 })
    }

    if (rawRows.length === 0) return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 })

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped  = 0

    try {
      for (const row of rawRows) {
        const code = row["code"]?.trim()
        const name = row["name"]?.trim()
        if (!code || !name) continue
        try {
          const [result] = await conn.execute(manufacturers.insert, [code, name])
          const mfgId = (result as any).insertId
          await conn.execute(manufacturers.insertDetails, [
            mfgId,
            row["location"]?.trim()        || null,
            row["gst_number"]?.trim()      || null,
            row["status"]?.trim()          || "active",
            row["registered_name"]?.trim() || null,
            row["zone"]?.trim()            || null,
            row["bank_name"]?.trim()       || null,
            row["ifsc_number"]?.trim()     || null,
            row["account_number"]?.trim()  || null,
            row["email"]?.trim()           || null,
          ])
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") { skipped++ } else { throw err }
        }
      }
      await conn.commit()
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
