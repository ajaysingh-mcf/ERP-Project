// POST /api/purchase-orders/[id]/cancel
// Fully cancel a raised PO and notify the manufacturer by email, referencing
// the originally raised quantity. Distinct from Short Close: cancellation
// voids the whole PO rather than accepting partial fulfillment as final.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, execute } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { sendPoCancellationEmail } from "@/lib/mailer"
import logger from "@/lib/logger"
import { recordFailedEvent, recordProcessedEvent, recordRawEvent } from "@/lib/events"

const CANCELLABLE = new Set(["raised", "punched", "partially_received"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const { id } = await params
  const poId = parseInt(id)
  if (isNaN(poId)) return NextResponse.json({ error: "Invalid PO id" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const reason: string | undefined = typeof body.reason === "string" ? body.reason : undefined

  const eventId = `po-cancel-${poId}-${Date.now()}`
  const logCtx = { requestId: crypto.randomUUID(), userId, route: `/api/purchase-orders/${poId}/cancel` }
  recordRawEvent("PO_CANCEL", eventId, { poId, userId, reason })

  try {
    const poRows = await query<{ id: number; po_no: string; status: string }>(
      purchaseOrdersSql.selectForEdit,
      [poId]
    )
    const po = poRows[0]
    if (!po) {
      logger.warn({ ...logCtx, poId, message: "PO not found" })
      return NextResponse.json({ error: `PO id=${poId} not found` }, { status: 404 })
    }

    if (!CANCELLABLE.has(po.status)) {
      return NextResponse.json(
        { error: `Cannot cancel a PO with status '${po.status}'. Allowed: raised, punched, partially_received.` },
        { status: 409 }
      )
    }

    await execute(purchaseOrdersSql.setStatus, ["cancelled", poId])
    logger.info({ ...logCtx, poId, po_no: po.po_no, previousStatus: po.status, message: "PO manually cancelled" })
    recordProcessedEvent("PO_CANCEL", eventId, { poId, poNo: po.po_no, userId })

    // Cancelling the PO already succeeded — email delivery is best-effort and
    // must never fail the request or leave the status change half-done.
    let emailed = false
    let emailSkipReason: string | undefined
    try {
      emailed = await sendPoCancellationEmail(poId, reason)
      if (!emailed) emailSkipReason = "no_email"
    } catch (emailErr: any) {
      logger.error({ ...logCtx, poId, err: emailErr.message, message: "PO cancellation email failed" })
      emailSkipReason = "send_failed"
    }

    return NextResponse.json({ ok: true, emailed, ...(emailSkipReason ? { emailSkipReason } : {}) })
  } catch (err: any) {
    recordFailedEvent("PO_CANCEL", eventId, { poId, userId }, err.message)
    logger.error({ ...logCtx, poId, err: err.message, stack: err.stack, message: "PO cancellation failed" })
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  }
}
