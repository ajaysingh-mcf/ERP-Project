// POST /api/manufacturing/misc-costs
//
// Create or update a bom_misc line — a manufacturer's per-SKU Job Work /
// Shrink Wrap / Shipper cost. No approval flow, same directness as
// /api/manufacturing/lines.

import { NextResponse } from "next/server"
import { execute, query } from "@/lib/db"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { miscCostActionSchema } from "@/lib/validation/manufacturing"
import { manufacturingSql } from "@/lib/queries/manufacturing"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import logger from "@/lib/logger"

export const POST = withGateway({
  schema: miscCostActionSchema,
  access: { pageSlug: "/manufacturing", level: "editor" },
  handler: async ({ body, ctx }) => {
    if (body.action === "create-misc") {
      const eventId = makeEventId("MFG_MISC_COST", "create", `${body.mfg_id}-${body.bom_id}-${body.type}`)
      const logCtx = { ...ctx, eventId, module: "MFG_MISC_COST_CREATE" }
      logger.info({ ...logCtx, mfgId: body.mfg_id, bomId: body.bom_id, type: body.type, cost: body.cost, message: "Misc. cost line create started" })
      recordRawEvent("MFG_MISC_COST", eventId, { mfgId: body.mfg_id, bomId: body.bom_id, type: body.type, cost: body.cost })

      try {
        const result = await execute(manufacturingSql.insertMisc, [
          body.bom_id,
          body.mfg_id,
          body.type,
          body.cost,
          body.effective_from,
          body.effective_till ?? null,
          body.status,
        ])
        logger.info({ ...logCtx, id: result.insertId, message: "Misc. cost line created" })
        recordProcessedEvent("MFG_MISC_COST", eventId, { id: result.insertId, mfgId: body.mfg_id, bomId: body.bom_id, type: body.type })
        return NextResponse.json({ ok: true, id: result.insertId })
      } catch (err: any) {
        recordFailedEvent("MFG_MISC_COST", eventId, { mfgId: body.mfg_id, bomId: body.bom_id, type: body.type }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Misc. cost line create failed" })
        throw new ApiError(500, "internal", "Database error")
      }
    }

    // action === "update-misc"
    if(body.action == "update-misc") {
      const eventId = makeEventId("MFG_MISC_COST_UPDATE", "update", body.id)
      const logCtx = { ...ctx, eventId, module: "MFG_MISC_COST_UPDATE" }
      logger.info({ ...logCtx, id: body.id, cost: body.cost, message: "Misc. cost line update started" })
      recordRawEvent("MFG_MISC_COST_UPDATE", eventId, { id: body.id, cost: body.cost })

      const rows = await query<{ id: number }>(manufacturingSql.selectMiscLineById, [body.id])
      if (!rows[0]) {
        logger.warn({ ...logCtx, id: body.id, message: "Misc. cost line not found" })
        throw new ApiError(404, "not_found", "Cost line not found.")
      }

      try {
        await execute(manufacturingSql.updateMisc, [
          body.cost,
          body.effective_from,
          body.effective_till ?? null,
          body.status,
          body.id,
        ])
        logger.info({ ...logCtx, id: body.id, message: "Misc. cost line updated" })
        recordProcessedEvent("MFG_MISC_COST_UPDATE", eventId, { id: body.id })
        return NextResponse.json({ ok: true })
      } catch (err: any) {
        recordFailedEvent("MFG_MISC_COST_UPDATE", eventId, { id: body.id }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Misc. cost line update failed" })
        throw new ApiError(500, "internal", "Database error")
      }
    }
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 })
  },
})
