// GET /api/masters/bom-master/[id]
//
// Returns a single BOM's header + all material lines for the detail side-panel.
// Gated by the same "/masters" viewer permission as the listing page — guards
// against a user reaching another BOM's details by editing the id in the URL.

import { NextResponse } from "next/server"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { bomIdParamSchema } from "@/lib/validation/bom"
import { query } from "@/lib/db"
import { bom } from "@/lib/queries/bom"
import type { BOM, BomDetailResponse } from "@/types/masters"

export const GET = withGateway({
  paramsSchema: bomIdParamSchema,
  access: { pageSlug: "/masters", level: "viewer" },
  handler: async ({ params }) => {
    // Header and lines are independent reads — run them concurrently instead
    // of paying two sequential round-trips to the DB.
    const [headerRows, lines] = await Promise.all([
      query<Omit<BomDetailResponse, "lines">>(bom.selectHeaderById, [params.id]),
      query<BOM>(bom.selectDetailLinesByBomId, [params.id]),
    ])
    const header = headerRows[0]
    if (!header) throw new ApiError(404, "not_found", "BOM not found.")

    const response: BomDetailResponse = { ...header, lines }
    return NextResponse.json(response)
  },
})
