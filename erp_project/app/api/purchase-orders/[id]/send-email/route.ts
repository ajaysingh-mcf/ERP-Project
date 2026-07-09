// POST /api/purchase-orders/[id]/send-email
// Manually resend the PO email to the manufacturer.
// Only allowed for POs in 'raised' status.

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { sendPoEmail } from "@/lib/mailer"
import logger from "@/lib/logger"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { poIdParamSchema } from "@/lib/validation/purchase-order-detail"
import { recordProcessedEvent, recordFailedEvent , makeEventId, recordRawEvent } from "@/lib/events"
import { auth } from "@/lib/auth"
import { record } from "zod"

export const POST = withGateway({
  paramsSchema: poIdParamSchema,
  handler: async ({ params, ctx }) => {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

    const poId = params.id
    const eventId = makeEventId("PO_EMAIL_SEND", "manual", poId)
    logger.info({ ...ctx, eventId, poId, message: "Manual PO email send requested" })
    recordRawEvent("PO_EMAIL_SEND", eventId, { poId, userId: session.user.id })

    const rows = await query<{ status: string }>(purchaseOrdersSql.selectForEdit, [poId])
    if (!rows[0]) throw new ApiError(404, "not_found", "PO not found")
    if (rows[0].status !== "raised") {
      throw new ApiError(409, "not_raised", "Email can only be sent for POs in 'raised' status.")
    }

    try {
      const sent = await sendPoEmail(poId, "manual")
      if (!sent) {
        logger.warn({ ...ctx, eventId, poId, message: "PO email skipped — no manufacturer email on file" })
        recordFailedEvent("PO_EMAIL_SEND", eventId, { poId, userId: session.user.id }, "Manufacturer has no email address on file")
        throw new ApiError(
          422,
          "no_email",
          "Manufacturer has no email address on file. Add an email in the Manufacturer master first."
        )
      }
      await execute(purchaseOrdersSql.setEmailSentAt, [poId])
      logger.info({ ...ctx, eventId, poId, message: "Manual PO email sent successfully" })
      recordProcessedEvent("PO_EMAIL_SEND", eventId, { poId, userId: session.user.id })
      return NextResponse.json({ ok: true })
    } catch (err: any) {
      if (err instanceof ApiError) throw err
      logger.error({ ...ctx, eventId, poId, error: err.message, message: "Manual PO email send failed" })
      recordFailedEvent("PO_EMAIL_SEND", eventId, { poId, userId: session.user.id }, err.message)
      throw new ApiError(500, "internal", "Failed to send email: " + err.message)
    }
  },
})
