// POST /api/purchase-orders/[id]/split
// Split a raised PO into N child POs, one per destination.
// The original PO is set to 'short_closed'; child POs inherit status 'raised'.
// Destination is stored in invoice_no until the schema gains a dedicated column.

import { NextRequest, NextResponse } from "next/server"
import type { PoolConnection } from "mysql2/promise"
import { auth } from "@/lib/auth"
import { query, pool } from "@/lib/db"

const SPLITTABLE = new Set(["draft", "raised", "punched", "partially_received"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { id } = await params
  const poId = parseInt(id)
  if (isNaN(poId)) return NextResponse.json({ error: "Invalid PO id" }, { status: 400 })

  const body = await req.json()
  const splits: { destination: string; qty: number }[] = body.splits ?? []

  if (!Array.isArray(splits) || splits.length < 2) {
    return NextResponse.json({ error: "At least 2 split rows are required." }, { status: 400 })
  }
  if (splits.some((s) => !s.qty || Number(s.qty) <= 0)) {
    return NextResponse.json({ error: "Each split must have a quantity greater than 0." }, { status: 400 })
  }

  // Fetch the original PO
  const poRows = await query<any>(
    "SELECT id, po_no, mfg_id, sku_code, qty, received_qty, expected_on, status FROM purchase_orders WHERE id = ? LIMIT 1",
    [poId]
  )
  const po = poRows[0]
  if (!po) return NextResponse.json({ error: "PO not found." }, { status: 404 })
  if (!SPLITTABLE.has(po.status)) {
    return NextResponse.json(
      { error: `Cannot split a PO with status '${po.status}'. Allowed: draft, raised, punched, partially_received.` },
      { status: 409 }
    )
  }

  const remaining = Number(po.qty) - Number(po.received_qty ?? 0)
  const splitTotal = splits.reduce((sum, s) => sum + Number(s.qty), 0)
  if (splitTotal > remaining) {
    return NextResponse.json(
      { error: `Split total (${splitTotal}) exceeds remaining qty (${remaining}).` },
      { status: 400 }
    )
  }

  const conn: PoolConnection = await pool.getConnection()
  await conn.beginTransaction()
  try {
    for (let i = 0; i < splits.length; i++) {
      const { destination, qty } = splits[i]
      const childPoNo = `${po.po_no}-S${i + 1}`
      await conn.execute(
        `INSERT INTO purchase_orders (po_no, mfg_id, date, sku_code, qty, expected_on, status, invoice_no)
         VALUES (?, ?, CURDATE(), ?, ?, ?, 'raised', ?)`,
        [childPoNo, po.mfg_id, po.sku_code, Number(qty), po.expected_on, destination || null]
      )
    }

    // Close the original
    await conn.execute("UPDATE purchase_orders SET status = 'short_closed' WHERE id = ?", [poId])

    await conn.commit()
    return NextResponse.json({ ok: true, splits_created: splits.length })
  } catch (err: any) {
    await conn.rollback()
    console.error("PO split error:", err)
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
