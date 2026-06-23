// GET /api/approvals/entity?module=RM_VRM&entity_id=123
//
// Returns the most recent rejection record for the given entity, plus the
// current user's ID so the client can decide whether the Save button should
// be enabled without making a second session call.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { approvalsSql } from "@/lib/queries/approvals"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const module   = searchParams.get("module")
  const entityId = searchParams.get("entity_id")

  if (!module || !entityId || isNaN(Number(entityId))) {
    return NextResponse.json({ error: "module and entity_id are required" }, { status: 400 })
  }

  const rows = await query<any>(approvalsSql.selectLatestRejection, [module, Number(entityId)])

  return NextResponse.json({
    rejection: rows[0] ?? null,
    current_user_id: parseInt(session.user.id),
  })
}
