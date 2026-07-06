// POST /api/purchase-orders/[id]/close
// Manually short-close a PO. Intended for cases where a significant qty remains
// but the operator has decided not to fulfil the remainder (e.g. 500 units left
// from a 10,000-unit order). Auto-close via the split route should handle the
// normal case — this is only for intentional early closure.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, execute } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import logger from "@/lib/logger"
import { recordFailedEvent, recordProcessedEvent, recordRawEvent } from "@/lib/events"

const CLOSEABLE = new Set(["raised", "punched", "partially_received"])

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const { id } = await params
  const poId = parseInt(id)
  if (isNaN(poId)) return NextResponse.json({ error: "Invalid PO id" }, { status: 400 })
  const eventId = `po-short-close-${poId}-${Date.now()}`
  const logCtx = { requestId: crypto.randomUUID(), userId, route: `/api/purchase-orders/${poId}/close` }
  recordRawEvent("PO_CLOSE", eventId, { poId, userId })

  try {
    const poRows = await query<{ id: number; po_no: string; status: string; qty: number; received_qty: number | null }>(
      purchaseOrdersSql.selectForEdit,
      [poId]
    )
    const po = poRows[0]
    if (!po) {
      logger.warn({ ...logCtx, poId, message: "PO not found" })
      return NextResponse.json({ error: `PO id=${poId} not found` }, { status: 404 })
    }

    if (!CLOSEABLE.has(po.status)) {
      return NextResponse.json(
        { error: `Cannot short-close a PO with status '${po.status}'. Allowed: raised, punched, partially_received.` },
        { status: 409 }
      )
    }

    await execute(purchaseOrdersSql.setStatus, ["short_closed", poId])
    logger.info({ ...logCtx, poId, po_no: po.po_no, previousStatus: po.status, message: "PO manually short_closed" })
    recordProcessedEvent("PO_CLOSE", eventId, { poId, poNo: po.po_no, userId })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    recordFailedEvent("PO_CLOSE", eventId, { poId, userId }, err.message)
    logger.error({ ...logCtx, poId, err: err.message, stack: err.stack, message: "PO short-close failed" })
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  }
}
