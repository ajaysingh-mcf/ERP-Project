import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { execute, pool } from "@/lib/db"
import { PMMaterials } from "@/lib/queries/product-materials"

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

  if (action === "create") {
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const hasVendorRate = !!body.vendor_code?.trim()
    const hasMfgRate = !!body.mfg_code?.trim()

    if (hasVendorRate || hasMfgRate) {
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        const [pmResult] = await conn.execute(PMMaterials.insert, toPmParams(body))
        const pmId = (pmResult as any).insertId

        if (hasVendorRate) {
          await conn.execute(PMMaterials.insertVendorRate, toVendorRateParams(pmId, body))
        } else {
          await conn.execute(PMMaterials.insertMfgRate, toMfgRateParams(pmId, body))
        }

        await conn.commit()
        return NextResponse.json({ id: pmId })
      } catch (err: any) {
        await conn.rollback()
        console.error("Packing material + rate insert error:", err)
        return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
      } finally {
        conn.release()
      }
    }

    // No rate data — insert pm only.
    try {
      const result = await execute(PMMaterials.insert, toPmParams(body))
      return NextResponse.json({ id: result.insertId })
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: `PM code "${body.pm_code?.trim()}" already exists` },
          { status: 409 }
        )
      }
      console.error("Packing material create error:", err)
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
        if (!row.name?.trim()) continue
        try {
          await conn.execute(PMMaterials.insert, toPmParams(row))
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
      console.error("Packing material bulk insert error:", err)
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
