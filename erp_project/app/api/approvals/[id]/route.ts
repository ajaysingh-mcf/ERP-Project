// POST /api/approvals/[id]
// Body: { action: "approve" | "reject", remarks?: string }
//
// Approve: delegates to the module's handler (applyAndArchive), then marks
//          the approval record as approved. All steps run in one transaction.
//
// Reject: sets the entity back to "draft" (re-editable) via the module's
//         handler (setStatus), then records mandatory rejection remarks.
//
// Auth: only users with the "admin" or "manager" role may call this endpoint.

import { NextRequest, NextResponse } from "next/server"
import type { PoolConnection } from "mysql2/promise"
import { auth } from "@/lib/auth"
import { query, pool } from "@/lib/db"
import { approvalsSql } from "@/lib/queries/approvals"
import { MODULE_HANDLERS, type DiffItem } from "@/lib/approvals/module-handlers"
import { APPROVAL_STATUS, STATUS } from "@/lib/constants"
import { sendPoEmail } from "@/lib/mailer"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const roles: string[] = session.user.roles ?? []
  if (!roles.some((r) => ["admin", "manager"].includes(r))) {
    return NextResponse.json({ error: "Forbidden — admin or manager role required" }, { status: 403 })
  }

  const { id } = await params
  const approvalId = parseInt(id)
  if (isNaN(approvalId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const body = await req.json()
  const { action, remarks } = body as { action: string; remarks?: string }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }
  if (action === "reject" && !remarks?.trim()) {
    return NextResponse.json({ error: "Rejection remarks are required" }, { status: 400 })
  }

  const approverId = parseInt(session.user.id)

  const [approval] = await query<any>(approvalsSql.getById, [approvalId])
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 })
  if (approval.status !== APPROVAL_STATUS.PENDING) {
    return NextResponse.json({ error: "This approval has already been actioned" }, { status: 409 })
  }

  const handler = MODULE_HANDLERS[approval.module]
  if (!handler) {
    return NextResponse.json({ error: `Unknown module: ${approval.module}` }, { status: 422 })
  }

  const items = await query<DiffItem>(approvalsSql.getItems, [approvalId])

  const conn: PoolConnection = await pool.getConnection()
  await conn.beginTransaction()
  try {
    if (action === "approve") {
      await handler.applyAndArchive(conn, approval.entity_id, items, approverId)
      await conn.execute(approvalsSql.markApproved, [approverId, approvalId])
    } else {
      await handler.setStatus(conn, approval.entity_id, STATUS.DRAFT)
      await conn.execute(approvalsSql.markRejected, [approverId, remarks!.trim(), approvalId])
    }
    await conn.commit()

    if (action === "approve" && approval.module === "PO") {
      sendPoEmail(approval.entity_id).catch((err) =>
        console.error("[mailer] auto PO email failed:", err)
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await conn.rollback()
    console.error(
      "[Approval] action=%s id=%d module=%s entity=%d user=%d error=%s",
      action, approvalId, approval.module, approval.entity_id, approverId, err.message
    )
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
