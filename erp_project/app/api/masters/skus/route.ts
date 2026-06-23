// API route for SKUs → table `skus`.
//
// Called by components/masters/AddRecordDialog and CsvImportDialog (both POST
// here with endpoint="/api/masters/skus"). On success the client calls
// router.refresh(), which re-runs SkusPage's SELECT so new rows appear.
//
// POST /api/masters/skus
//   Request  { action: "create", sku_code, name, brand?, category?, status? }
//     Process → INSERT one row, stamping created_by from the session.
//     Response 200 { id }              — new auto-increment id
//              400 { error }           — sku_code/name missing
//              409 { error }           — sku_code already exists (unique key)
//
//   Request  { action: "bulk", rows: [{ sku_code, name, ... }, ...] }
//     Process → INSERT each row inside ONE transaction; rows whose sku_code
//               already exists are counted as skipped (not an error).
//     Response 200 { inserted, skipped }
//              400 { error }           — rows missing/empty
//              500 { error }           — DB failure (whole batch rolled back)
//
// Auth: any signed-in user (401 otherwise).


import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { execute, pool } from "@/lib/db"
import { skus as skuSql } from "@/lib/queries/skus"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const { sku_code, name, brand, category, status } = body
    if (!sku_code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "sku_code and name are required" }, { status: 400 })
    }
    try {
      const result = await execute(
        "INSERT INTO skus (sku_code, name, brand, category, status, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        [
          sku_code.trim(),
          name.trim(),
          brand?.trim() || null,
          category?.trim() || null,
          status || "active",
          parseInt(session.user.id),
        ]
      )
      return NextResponse.json({ id: result.insertId })
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: `SKU code "${sku_code.trim()}" already exists` },
          { status: 409 }
        )
      }
      console.error("SKU create error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
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
        if (!row.sku_code?.trim() || !row.name?.trim()) continue
        try {
          await conn.execute(
            "INSERT INTO skus (sku_code, name, brand, category, status, created_by) VALUES (?, ?, ?, ?, ?, ?)",
            [
              row.sku_code.trim(),
              row.name.trim(),
              row.brand?.trim() || null,
              row.category?.trim() || null,
              row.status || "active",
              parseInt(session.user.id),
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
      console.error("SKU bulk insert error:", err)
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  if (action === "update") {
    const { id, name, brand, category, status } = body
    if (!id || !name?.trim()) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 })
    }

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      // Fetch current values before overwriting — snapshot for history.
      const [rows] = await conn.execute(skuSql.selectById, [id])
      const old = (rows as any[])[0]
      if (!old) {
        await conn.rollback()
        return NextResponse.json({ error: "SKU not found" }, { status: 404 })
      }

      // Archive the pre-edit snapshot.
      await conn.execute(skuSql.insertHistory, [
        old.id, old.sku_code, old.name, old.brand ?? null,
        old.category ?? null, old.status ?? null,
        parseInt(session.user.id),
      ])

      // Apply the update.
      await conn.execute(skuSql.updateSku, [
        name.trim(),
        brand?.trim() || null,
        category?.trim() || null,
        status || "active",
        id,
      ])

      await conn.commit()
      return NextResponse.json({ ok: true })
    } catch (err: any) {
      await conn.rollback()
      console.error("SKU update error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
