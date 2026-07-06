// GET /api/approvals
// Returns all pending approvals with field-level diff items.
// Any authenticated user can view; only admin/manager can action (see [id]/route.ts).

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { approvalsSql, entityLabelSql } from "@/lib/queries/approvals"
import logger from "@/lib/logger"
export async function GET() {
  const requestId = crypto.randomUUID()

  const session = await auth()
  if (!session?.user) {
    logger.warn({ requestId, route: "/api/approvals", message: "Unauthenticated access attempt" })
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 }
    )
  }

  const ctx = {
    requestId,
    userId: session.user.id,
    route: "/api/approvals",
  }

  const logCtx = {
    ...ctx,
    module: "GET_APPROVALS",
  }

  logger.info({ ...logCtx,  message: "Fetching pending approvals started",
  })

  try {
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
          entity_code: label.code ?? null,
          entity_name: label.name ?? null,
          entity_secondary_code: label.secondary_code ?? null,
          entity_secondary_name: label.secondary_name ?? null,
        }
      })
    )

    logger.info({ ...logCtx, approvalCount: approvals.length, message: "Pending approvals fetched successfully" })

    return NextResponse.json(approvals)
  } catch (err: any) {
    logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Failed to fetch pending approvals" })
    return NextResponse.json(
      { error: "Database error" },
      { status: 500 }
    )
  }
}
