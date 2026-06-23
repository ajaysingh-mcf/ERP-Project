// GET /api/approvals
// Returns all pending approvals with field-level diff items.
// Any authenticated user can view; only admin/manager can action (see [id]/route.ts).

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { approvalsSql } from "@/lib/queries/approvals"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const rows = await query<any>(approvalsSql.listPending, [])
  const approvals = await Promise.all(
    rows.map(async (a) => ({
      ...a,
      items: await query<any>(approvalsSql.getItems, [a.id]),
    }))
  )

  return NextResponse.json(approvals)
}
