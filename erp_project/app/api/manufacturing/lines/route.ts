// POST /api/manufacturing/lines
//
// Create or update a master_bom_mfg line (a manufacturer's SKU-level
// production entry: capacity, this-month plan, status, last batch, remarks).
// No approval flow — master_bom_mfg isn't a registered approval module, same
// directness as bom-master's direct writes.

import { NextResponse } from "next/server"
import { execute, query } from "@/lib/db"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { mfgLineActionSchema } from "@/lib/validation/manufacturing"
import { manufacturingSql } from "@/lib/queries/manufacturing"

export const POST = withGateway({
  schema: mfgLineActionSchema,
  access: { pageSlug: "/manufacturing", level: "editor" },
  handler: async ({ body, session }) => {
    const userId = Number(session.user.id)

    if (body.action === "create") {
      const result = await execute(manufacturingSql.insertLine, [
        body.bom_id,
        body.mfg_id,
        body.status,
        body.effective_from,
        body.monthly_capacity ?? null,
        body.this_month_plan ?? null,
        body.last_batch_date ?? null,
        body.remarks ?? null,
        userId,
      ])
      return NextResponse.json({ ok: true, id: result.insertId })
    }

    // action === "update"
    const rows = await query<{ id: number }>(manufacturingSql.selectLineById, [body.id])
    if (!rows[0]) throw new ApiError(404, "not_found", "Manufacturing line not found.")

    await execute(manufacturingSql.updateLine, [
      body.status,
      body.monthly_capacity ?? null,
      body.this_month_plan ?? null,
      body.last_batch_date ?? null,
      body.remarks ?? null,
      body.id,
    ])
    return NextResponse.json({ ok: true })
  },
})
