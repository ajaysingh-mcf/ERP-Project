// POST /api/purchase-orders/[id]/cancel
// Fully cancel a raised PO and notify the manufacturer by email, referencing
// the originally raised quantity. Distinct from Short Close: cancellation
// voids the whole PO rather than accepting partial fulfillment as final.

import { NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { sendPoCancellationEmail } from "@/lib/mailer"
import logger from "@/lib/logger"
import { recordFailedEvent, recordRawEvent, makeEventId, recordProcessedEvent } from "@/lib/events"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { poIdParamSchema, poCancelSchema } from "@/lib/validation/purchase-order-detail"
import {auth} from "@/lib/auth"

const CANCELLABLE = new Set(["raised", "punched", "partially_received"])

export const POST = withGateway({
  paramsSchema: poIdParamSchema,
  schema: poCancelSchema,
  access: { pageSlug: "/po-tracking", level: "editor" },
  handler: async ({ params, body, session, ctx }) => {
    const poId = params.id
    const { reason } = body
    const userId = Number(session.user.id)

    const eventId = makeEventId("PO_CANCEL", "cancel", poId)
    recordRawEvent("PO_CANCEL", eventId, { poId, userId, reason })

    try {
      const poRows = await query<{ id: number; po_no: string; status: string }>(
        purchaseOrdersSql.selectForEdit,
        [poId]
      )
      const po = poRows[0]
      if (!po) throw new ApiError(404, "not_found", `PO id=${poId} not found`)

      if (!CANCELLABLE.has(po.status)) {
        throw new ApiError(
          409,
          "not_cancellable",
          `Cannot cancel a PO with status '${po.status}'. Allowed: raised, punched, partially_received.`
        )
      }

      await execute(purchaseOrdersSql.setStatus, ["cancelled", poId])
      logger.info({ ...ctx, eventId, poId, po_no: po.po_no, previousStatus: po.status, message: "PO manually cancelled" })
      recordProcessedEvent("PO_CANCEL", eventId, { poId, poNo: po.po_no, userId })

      // Cancelling the PO already succeeded — email delivery is best-effort and
      // must never fail the request or leave the status change half-done.
      let emailed = false
      let emailSkipReason: string | undefined

      try {
        emailed = await sendPoCancellationEmail(poId, reason)
        if (!emailed) emailSkipReason = "no_email"
      } catch (emailErr: any) {
        logger.error({ ...ctx, eventId, poId, err: emailErr.message, message: "PO cancellation email failed" })
        emailSkipReason = "send_failed"
      }
      logger.info({ ...ctx, eventId, poId, po_no: po.po_no, emailed, emailSkipReason, message: "PO cancellation email attempt completed" })
      recordProcessedEvent("PO_CANCEL_EMAIL Sent", eventId, { poId, poNo: po.po_no, emailed, emailSkipReason })
      return NextResponse.json({ ok: true, emailed, ...(emailSkipReason ? { emailSkipReason } : {}) })
    } catch (err: any) {
      if (err instanceof ApiError) throw err
      recordFailedEvent("PO_CANCEL", eventId, { poId, userId }, err.message)
      logger.error({ ...ctx, eventId, poId, err: err.message, stack: err.stack, message: "PO cancellation failed" })
      throw new ApiError(500, "internal", "Database error: " + err.message)
    }
  },
})
