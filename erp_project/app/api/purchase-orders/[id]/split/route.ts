// POST /api/purchase-orders/[id]/split
// Split a raised PO into N child POs across (optionally different) manufacturers.
//
// Parent PO closing rules:
//   splitTotal >= remaining → parent set to 'short_closed' (all qty handed off)
//   splitTotal <  remaining → parent qty reduced by splitTotal; status unchanged
//                             (original mfg still fulfils the leftover qty)

import { NextRequest, NextResponse } from "next/server"
import type { PoolConnection } from "mysql2/promise"
import { auth } from "@/lib/auth"
import { query, pool } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { approvalsSql } from "@/lib/queries/approvals"
import { manufacturers as mfgsSql } from "@/lib/queries/manufacturers"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"

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
  const splits: { mfg_id: number; destination: string; qty: number }[] = body.splits ?? []

  if (!Array.isArray(splits) || splits.length < 2) {
    return NextResponse.json({ error: "At least 2 split rows are required." }, { status: 400 })
  }
  if (splits.some((s) => !s.mfg_id || isNaN(Number(s.mfg_id)))) {
    return NextResponse.json({ error: "Each split row must have a manufacturer selected." }, { status: 400 })
  }
  if (splits.some((s) => !s.qty || Number(s.qty) <= 0)) {
    return NextResponse.json({ error: "Each split must have a quantity greater than 0." }, { status: 400 })
  }

  // Fetch the original PO
  const poRows = await query<any>(purchaseOrdersSql.selectForSplit, [poId])
  const po = poRows[0]
  if (!po) return NextResponse.json({ error: "PO not found." }, { status: 404 })
  if (!SPLITTABLE.has(po.status)) {
    return NextResponse.json(
      { error: `Cannot split a PO with status '${po.status}'. Allowed: draft, raised, punched, partially_received.` },
      { status: 409 }
    )
  }

  const remaining  = Number(po.qty) - Number(po.received_qty ?? 0)
  const splitTotal = splits.reduce((sum, s) => sum + Number(s.qty), 0)
  console.log(`[split] po_id=${poId} po.qty=${po.qty} received=${po.received_qty} remaining=${remaining} splitTotal=${splitTotal}`)
  if (splitTotal > remaining) {
    return NextResponse.json(
      { error: `Split total (${splitTotal}) exceeds remaining qty (${remaining}).` },
      { status: 400 }
    )
  }

  const userId = parseInt(session.user.id)

  const eventId = `po-split-${poId}-${Date.now()}`
  console.log(`[events] PO split id=${poId} into ${splits.length} — firing raw event ${eventId}`)
  recordRawEvent("PO_SPLIT", eventId, { parentPoId: poId, parentPoNo: po.po_no, splits })

  // Pre-fetch all unique manufacturer names needed for approval diffs
  const uniqueMfgIds = [...new Set(splits.map((s) => s.mfg_id))]
  const mfgMap: Record<number, { code: string; name: string }> = {}
  for (const mfgId of uniqueMfgIds) {
    const rows = await query<any>(mfgsSql.selectNameById, [mfgId])
    mfgMap[mfgId] = rows[0] ?? { code: String(mfgId), name: String(mfgId) }
  }

  const conn: PoolConnection = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const isParentDraft = po.status === "draft"
    const childStatus   = isParentDraft ? "draft" : "raised"

    for (let i = 0; i < splits.length; i++) {
      const { mfg_id, destination, qty } = splits[i]
      const childPoNo = `${po.po_no}-S${i + 1}`
      const mfg = mfgMap[mfg_id]

      const [childResult] = await conn.execute(
        purchaseOrdersSql.insertSplit,
        [childPoNo, mfg_id, po.sku_code, Number(qty), po.expected_on, childStatus, destination || null]
      )
      const childId = (childResult as any).insertId

      // If parent was draft, each child needs its own approval record
      if (isParentDraft) {
        const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PO", childId])
        const approvalId = (ar as any).insertId
        const items: [string, string, string][] = [
          ["po_no",        "", childPoNo],
          ["manufacturer", "", `${mfg.code} — ${mfg.name}`],
          ["sku_code",     "", po.sku_code],
          ["qty",          "", String(qty)],
          ["expected_on",  "", po.expected_on || ""],
          ["destination",  "", destination || ""],
          ["split_from",   "", po.po_no],
        ]
        for (const [field, oldVal, newVal] of items) {
          await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, oldVal, newVal])
        }
      }
    }

    // Close or trim the original PO
    let splitType: "full" | "partial"
    if (splitTotal >= remaining) {
      splitType = "full"
      console.log(`[split] FULL split — setting parent ${poId} to short_closed`)
      await conn.execute(purchaseOrdersSql.setStatus, ["short_closed", poId])
    } else {
      splitType = "partial"
      const newQty = Number(po.qty) - splitTotal
      console.log(`[split] PARTIAL split — reducing parent ${poId} qty from ${po.qty} to ${newQty}`)
      await conn.execute(purchaseOrdersSql.setQty, [newQty, poId])
    }

    await conn.commit()
    recordProcessedEvent("PO_SPLIT", eventId, { parentPoId: poId, splitsCreated: splits.length, splitType })
    return NextResponse.json({ ok: true, splits_created: splits.length, split_type: splitType })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("PO_SPLIT", eventId, { parentPoId: poId, splits }, err.message)
    console.error("PO split error:", err)
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
