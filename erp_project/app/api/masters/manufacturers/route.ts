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
import { pool } from "@/lib/db"
import { manufacturers } from "@/lib/queries/manufacturers"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const { code, name, location, gst_number, status } = body
    if (!code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "code and name are required" }, { status: 400 })
    }
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [result] = await conn.execute(manufacturers.insert, [code.trim(), name.trim()])
      const mfgId = (result as any).insertId
      await conn.execute(manufacturers.insertDetails, [
        mfgId,
        location?.trim() || null,
        gst_number?.trim() || null,
        status || "active",
      ])
      await conn.commit()
      return NextResponse.json({ id: mfgId })
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
            row.location?.trim() || null,
            row.gst_number?.trim() || null,
            row.status || "active",
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

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
