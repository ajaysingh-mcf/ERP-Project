// API route for Vendors → table `vendors`.
//
// Called by VendorsClient's AddRecordDialog / CsvImportDialog
// (endpoint="/api/masters/vendors"). On success the client refreshes the page.
//
// A vendor lives across TWO tables, linked only by id (no DB foreign key):
//   vendors(id, code, name, type)
//   vendor_details(vendor_id → vendors.id, location, gst_number, status)
// So every insert is: INSERT the vendor, read its new id (result.insertId),
// then INSERT the matching vendor_details row — both inside one transaction so
// we never leave a vendor without its details (or vice-versa).
//
// POST /api/masters/vendors
//   Request  { action: "create", code, name, type, location?, gst_number?, status? }
//     Process → INSERT vendors → INSERT vendor_details(vendor_id = new id).
//     Response 200 { id } (the new vendors.id) · 400 (missing) · 409 (code exists)
//
//   Request  { action: "bulk", rows: [{ code, name, type, location?, ... }, ...] }
//     Process → per row: INSERT vendor + vendor_details; existing codes skipped.
//     Response 200 { inserted, skipped } · 400 { error } · 500 { error }
//
// Auth: any signed-in user (401 otherwise). `vendors.code` is UNIQUE, so
// skip-on-duplicate works. `type` is a NOT NULL enum, so it is required.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { vendors } from "@/lib/queries/vendors"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const { code, name, type, location, gst_number, status } = body
    if (!code?.trim() || !name?.trim() || !type?.trim()) {
      return NextResponse.json(
        { error: "code, name and type are required" },
        { status: 400 }
      )
    }

    // Two inserts in one transaction: vendor first, then its details using the
    // id the DB just generated. If either fails, both roll back.
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      // Inserting the vendor returns an insertId we can use for the details row.
      //  If the code already exists, the UNIQUE constraint triggers an error 
      // and we skip the details insert.
      const [vendorResult] = await conn.execute(
        vendors.insertVendor,
        [code.trim(), name.trim(), type.trim()]
      )
      const vendorId = (vendorResult as { insertId: number }).insertId

      await conn.execute(
        vendors.insertVendorDetails,
        [
          vendorId,
          location?.trim() || null,
          gst_number?.trim() || null,
          status || "active",
        ]
      )

      await conn.commit()
      return NextResponse.json({ id: vendorId })
    } catch (err: any) {
      await conn.rollback()
      if (err.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: `Code "${code.trim()}" already exists` },
          { status: 409 }
        )
      }
      console.error("Vendor create error:", err)
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
        if (!row.code?.trim() || !row.name?.trim() || !row.type?.trim()) continue
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
              row.gst_number?.trim() || null,
              row.status || "active",
            ]
          )
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
      console.error("Vendor bulk insert error:", err)
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
