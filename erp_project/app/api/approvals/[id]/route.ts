// POST /api/approvals/[id]
// Body: { action: "approve" | "reject", remarks?: string }
//
// Approve: delegates to the module's handler (applyAndArchive), then marks
//          the approval record as approved. All steps run in one transaction.
//
// Reject: sets the entity to "rejected" (re-editable by the original
//         submitter) via the module's handler (setStatus), then records
//         mandatory rejection remarks.
//
// Auth: only users with the "admin" or "manager" role may call this endpoint.

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import type { PoolConnection } from "mysql2/promise"
import { auth } from "@/lib/auth"
import { query, execute, pool } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { approvalsSql } from "@/lib/queries/approvals"
import { MODULE_HANDLERS, type DiffItem } from "@/lib/approvals/module-handlers"
import { APPROVAL_STATUS, STATUS } from "@/lib/constants"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import { sendPoEmail } from "@/lib/mailer"
import logger from "@/lib/logger"
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const { id } = await params

  const ctx = {
    requestId: crypto.randomUUID(),
    userId: session ? Number(session.user.id) : undefined,
    route: `/api/approval/[${id}]`,
  }
  logger.info({ ...ctx, message: "Approval API request received" })

  const roles: string[] = session.user.roles ?? []
  if (!roles.some((r) => ["admin", "manager"].includes(r))) {
    logger.warn({ ...ctx, message: "Approval action forbidden: insufficient role", roles })
    return NextResponse.json({ error: "Forbidden — admin or manager role required" }, { status: 403 })
  }

  const approvalId = parseInt(id)
  if (isNaN(approvalId)) {
    logger.error({ ...ctx, message: "Invalid approval id", rawId: id })
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  const body = await req.json()
  const { action, remarks } = body as { action: string; remarks?: string }
  const logCtx = { ...ctx, approvalId, action }

  if (action !== "approve" && action !== "reject") {
    logger.warn({ ...logCtx, message: "Invalid action value", action })
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }
  if (action === "reject" && !remarks?.trim()) {
    logger.warn({ ...logCtx, message: "Rejection rejected: missing remarks" })
    return NextResponse.json({ error: "Rejection remarks are required" }, { status: 400 })
  }

  const approverId = parseInt(session.user.id)

  const [approval] = await query<any>(approvalsSql.getById, [approvalId])
  if (!approval) {
    logger.warn({ ...logCtx, message: "Approval not found" })
    return NextResponse.json({ error: "Approval not found" }, { status: 404 })
  }
  if (approval.status !== APPROVAL_STATUS.PENDING) {
    logger.warn({ ...logCtx, message: "Approval already actioned", module: approval.module, currentStatus: approval.status })
    return NextResponse.json({ error: "This approval has already been actioned" }, { status: 409 })
  }

  const handler = MODULE_HANDLERS[approval.module]
  if (!handler) {
    logger.error({ ...logCtx, message: "Unknown module", module: approval.module })
    return NextResponse.json({ error: `Unknown module: ${approval.module}` }, { status: 422 })
  }

  const items = await query<DiffItem>(approvalsSql.getItems, [approvalId])

  // ── Event S3 bucket ───────────────────────────────────────────────────
  const eventId = makeEventId("APPROVAL", "decide", approvalId)
  const eventLogCtx = { ...logCtx, eventId, module: approval.module, entityId: approval.entity_id }

  recordRawEvent("APPROVAL", eventId, {
    approvalId,
    module:    approval.module,
    entityId:  approval.entity_id,
    approverId,
    action,
    remarks:   remarks?.trim() ?? null,
    raisedBy:  approval.raised_by,
    items,
  })

  const conn: PoolConnection = await pool.getConnection()
  await conn.beginTransaction()
  try {
    if (action === "approve") {
      await handler.applyAndArchive(conn, approval.entity_id, items, approverId)
      await conn.execute(approvalsSql.markApproved, [approverId, approvalId])
      logger.info({ ...eventLogCtx, message: "Approval applied and archived", approverId })
    } else {
      await handler.setStatus(conn, approval.entity_id, STATUS.REJECTED)
      await conn.execute(approvalsSql.markRejected, [approverId, remarks!.trim(), approvalId])
      logger.info({ ...eventLogCtx, message: "Approval rejected, entity marked as rejected", approverId })
    }
    await conn.commit()

    // Manufacturer-scoped rm_mrm_fixed/pm_mrm_fixed rate reads are cached
    // (see lib/cached-reference-data.ts) since they rarely change — bust
    // that cache immediately on approve/reject instead of waiting out the
    // timer, so the Manufacturing module's RM Vendor / Agreed Rates tabs
    // reflect this change on next load.
    if (approval.module === "RM_RATE") revalidateTag("ref:mfg-rm-rates", "max")
    if (approval.module === "PM_RATE") revalidateTag("ref:mfg-pm-rates", "max")

    recordProcessedEvent("APPROVAL", eventId, {
      approvalId, module: approval.module, entityId: approval.entity_id, approverId, action,
    })

    // ── Auto-send PO email after impromptu PO approval ────────────────────
    // Fire-and-forget: don't block the approval response on email/PDF generation.
    // email_sent_at is stamped after send so the table shows re-send icons.
    if (action === "approve" && approval.module === "PO") {
      const poId = approval.entity_id
      ;(async () => {
        try {
          const sent = await sendPoEmail(poId)
          if (sent) {
            await execute(purchaseOrdersSql.setEmailSentAt, [poId])
            logger.info({ ...eventLogCtx, message: "Auto-sent PO email", poId })
          } else {
            logger.warn({ ...eventLogCtx, message: "PO approved but manufacturer has no email — skipped auto-send", poId })
          }
        } catch (err: any) {
          logger.error({ ...eventLogCtx, message: "Auto-send PO email failed", poId, error: err.message })
        }
      })()
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await conn.rollback()

    logger.error({ ...eventLogCtx, message: "Approval transaction failed", approverId, error: err.message, code: err.code })
    recordFailedEvent("APPROVAL", eventId, {
      approvalId, module: approval.module, entityId: approval.entity_id, action,
    }, err.message)

    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
