import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, pool } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { approvalsSql } from "@/lib/queries/approvals"
import { skus as skusSql } from "@/lib/queries/skus"
import { manufacturers as mfgsSql } from "@/lib/queries/manufacturers"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"
import type { PoolConnection } from "mysql2/promise"

// GET /api/purchase-orders — list all POs with MFG + SKU details
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const rows = await query<any>(purchaseOrdersSql.selectAll, [])
  return NextResponse.json(rows)
}

// POST /api/purchase-orders — create an impromptu PO and submit for approval
// Flow: insert PO as 'draft' → insert approval record → on approve, status → 'raised'
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const body = await req.json()
  const { mfg_id, sku_code, qty, expected_on, destination, reason } = body

  if (!mfg_id)                   return NextResponse.json({ error: "Manufacturer is required." }, { status: 400 })
  if (!sku_code)                  return NextResponse.json({ error: "SKU is required." }, { status: 400 })
  if (!qty || Number(qty) <= 0)  return NextResponse.json({ error: "Quantity must be greater than 0." }, { status: 400 })

  // Verify SKU is active
  const skuRows = await query<{ status: string }>(skusSql.selectStatusByCode, [sku_code])
  if (!skuRows[0]) return NextResponse.json({ error: "SKU not found." }, { status: 400 })
  if (skuRows[0].status !== "active") {
    return NextResponse.json(
      { error: `SKU is currently '${skuRows[0].status.replace(/_/g, " ")}' and cannot be used for a new PO.` },
      { status: 400 }
    )
  }

  // Generate po_no: IMP-YYYY-NNN
  const countRows = await query<{ cnt: number }>(purchaseOrdersSql.countImpromptu, [])
  const seq  = (Number(countRows[0]?.cnt ?? 0) + 1).toString().padStart(3, "0")
  const po_no = `IMP-${new Date().getFullYear()}-${seq}`

  const eventId = `po-new-${Date.now()}`
  console.log(`[events] PO create — firing raw event ${eventId}`)
  recordRawEvent("PO", eventId, { mfg_id, sku_code, qty, expected_on, destination, reason })

  const conn: PoolConnection = await pool.getConnection()
  await conn.beginTransaction()
  try {
    // 1. Insert PO as draft
    const [poResult] = await conn.execute(purchaseOrdersSql.insert, [
      po_no, Number(mfg_id), sku_code, Number(qty), expected_on || null, destination || null,
    ])
    const poId = (poResult as any).insertId

    // 2. Fetch MFG details for a readable diff
    const [mfgRows] = await conn.execute(mfgsSql.selectNameById, [Number(mfg_id)])
    const mfg = (mfgRows as any[])[0] ?? { code: mfg_id, name: mfg_id }

    // 3. Insert approval record
    const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PO", poId])
    const approvalId = (ar as any).insertId

    // 4. Insert approval_items so the approver sees what is being requested
    const diffItems: [string, string, string][] = [
      ["po_no",        "", po_no],
      ["manufacturer", "", `${mfg.code} — ${mfg.name}`],
      ["sku_code",     "", sku_code],
      ["qty",          "", String(qty)],
      ["expected_on",  "", expected_on || ""],
      ["destination",  "", destination || ""],
    ]
    if (reason?.trim()) {
      diffItems.push(["reason", "", reason.trim()])
    }
    for (const [field, oldVal, newVal] of diffItems) {
      await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, oldVal, newVal])
    }

    await conn.commit()
    recordProcessedEvent("PO", eventId, { poId, po_no, approvalId })
    return NextResponse.json({ ok: true, approval_id: approvalId, po_no })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("PO", eventId, { mfg_id, sku_code, qty, expected_on, destination, reason }, err.message)
    if (err.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "PO number already exists, please retry." }, { status: 409 })
    }
    console.error("Impromptu PO create error:", err)
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
