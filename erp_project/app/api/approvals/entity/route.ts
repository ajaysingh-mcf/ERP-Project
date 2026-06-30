// GET /api/approvals/entity?module=RM_VRM&entity_id=123
//
// Returns the most recent rejection record for the given entity, plus the
// current user's ID so the client can decide whether the Save button should
// be enabled without making a second session call.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { approvalsSql } from "@/lib/queries/approvals"
import logger from "@/lib/logger"
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    logger.warn({ requestId: crypto.randomUUID(), route: "/api/approvals/entity", message: "Unauthenticated access attempt" })
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const module = searchParams.get("module")
  const entityId = searchParams.get("entity_id")

  const ctx = {
    requestId: crypto.randomUUID(),
    userId: session.user.id,
    route: "/api/approvals/entity",
  }
  const logCtx = { ...ctx, module: "GET_APPROVAL_ENTITY" }
  logger.info({ ...logCtx, queryModule: module, entityId, message: "Approval entity search started" })
  if (!module || !entityId || isNaN(Number(entityId))) {
    logger.warn({ ...logCtx, queryModule: module, entityId, message: "Validation failed. module and entity_id are required" })
    return NextResponse.json(
      { error: "module and entity_id are required" },
      { status: 400 }
    )
  }

  try {
    const rows = await query<any>( approvalsSql.selectLatestRejection, [module, Number(entityId)] )
    logger.info({ ...logCtx, queryModule: module, entityId: Number(entityId), found: rows.length > 0, message: "Approval entity fetched successfully" })
    return NextResponse.json({
      rejection: rows[0] ?? null,
      current_user_id: parseInt(session.user.id),
    })
  } catch (err: any) {
    logger.error({ ...logCtx, queryModule: module, entityId, err: err.message, stack: err.stack, message: "Failed to fetch approval entity" })
    return NextResponse.json(
      { error: "Database error" },
      { status: 500 }
    )
  }
}
