// GET /api/approvals
// Returns all pending approvals with field-level diff items.
// Any authenticated user can view; only admin/manager can action (see [id]/route.ts).

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { approvalsSql, entityLabelSql } from "@/lib/queries/approvals"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const rows = await query<any>(approvalsSql.listPending, [])
  const approvals = await Promise.all(
    rows.map(async (a) => {
      const [items, labelRows] = await Promise.all([
        query<any>(approvalsSql.getItems, [a.id]),
        entityLabelSql[a.module]
          ? query<any>(entityLabelSql[a.module], [a.entity_id])
          : Promise.resolve([]),
      ])
      const label = labelRows[0] ?? {}
      return {
        ...a,
        items,
        entity_code:           label.code           ?? null,
        entity_name:           label.name           ?? null,
        entity_secondary_code: label.secondary_code ?? null,
        entity_secondary_name: label.secondary_name ?? null,
      }
    })
  )

  return NextResponse.json(approvals)
}
