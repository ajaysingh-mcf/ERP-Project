// GET /api/masters/bom-master/history/[id]
//
// Returns a single BOM's header + its ARCHIVED material lines (history_bom)
// for the read-only History detail panel. Same access rule and response
// shape as /api/masters/bom-master/[id] — only the line source differs.

import { NextResponse } from "next/server"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { bomIdParamSchema } from "@/lib/validation/bom"
import { query } from "@/lib/db"
import { bom } from "@/lib/queries/bom"
import type { BOM, BomDetailResponse } from "@/types/masters"

export const GET = withGateway({
  paramsSchema: bomIdParamSchema,
  access: { pageSlug: "/masters/bom-master", level: "viewer" },
  handler: async ({ params }) => {
    const [headerRows, lines] = await Promise.all([
      query<Omit<BomDetailResponse, "lines">>(bom.selectHeaderById, [params.id]),
      query<BOM>(bom.selectHistoryLinesByBomId, [params.id]),
    ])
    const header = headerRows[0]
    if (!header) throw new ApiError(404, "not_found", "BOM not found.")
    if (lines.length === 0) throw new ApiError(404, "no_history", "This BOM has no archived revisions.")

    const response: BomDetailResponse = { ...header, lines }
    return NextResponse.json(response)
  },
})
