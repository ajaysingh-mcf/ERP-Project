// POST /api/purchase-orders/[id]/split
// Split a raised PO into N child POs across (optionally different) manufacturers.
//
// Parent PO closing rules (qty is NEVER mutated — it matches the email already sent):
//   remaining after split <= tolerance (min(100, 10% of qty)) → status = 'received'
//   remaining after split >  tolerance → status unchanged (remaining bar shrinks)
//   short_closed is set manually only (for intentional early closure with large remainder)

import { NextResponse } from "next/server"
import type { PoolConnection } from "mysql2/promise"
import { query, pool } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { approvalsSql } from "@/lib/queries/approvals"
import { manufacturers as mfgsSql } from "@/lib/queries/manufacturers"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import logger from "@/lib/logger"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { poIdParamSchema, poSplitSchema } from "@/lib/validation/purchase-order-detail"

const SPLITTABLE = new Set(["draft", "raised", "punched", "partially_received"])

export const POST = withGateway({
  paramsSchema: poIdParamSchema,
  schema: poSplitSchema,
  access: { pageSlug: "/po-tracking", level: "editor" },
  handler: async ({ body, params, session, ctx }) => {
    const poId = params.id
    const { splits } = body

    // Fetch the original PO
    const poRows = await query<any>(purchaseOrdersSql.selectForSplit, [poId])
    const po = poRows[0]
    if (!po) throw new ApiError(404, "not_found", "PO not found.")
    if (!SPLITTABLE.has(po.status)) {
      throw new ApiError(
        409,
        "not_splittable",
        `Cannot split a PO with status '${po.status}'. Allowed: draft, raised, punched, partially_received.`
      )
    }

    const remaining  = Number(po.qty) - Number(po.received_qty ?? 0)
    const splitTotal = splits.reduce((sum, s) => sum + Number(s.qty), 0)
    if (splitTotal > remaining) {
      throw new ApiError(400, "over_limit", `Split total (${splitTotal}) exceeds remaining qty (${remaining}).`)
    }

    const userId = Number(session.user.id)

    const eventId = makeEventId("PO_SPLIT", "split", poId)
    const logCtx = { ...ctx, eventId, module: "PO_SPLIT" }
    logger.info({ ...logCtx, parentPoId: poId, splitCount: splits.length, remaining, splitTotal, message: "PO split started" })
    recordRawEvent("PO_SPLIT", eventId, { parentPoId: poId, parentPoNo: po.po_no, splits })

    // Pre-fetch all unique manufacturer names needed for approval diffs
    const uniqueMfgIds = [...new Set(splits.map((s) => s.mfg_id))]
    const mfgMap: Record<number, { code: string; name: string }> = {}
    for (const mfgId of uniqueMfgIds) {
      const rows = await query<any>(mfgsSql.selectNameById, [mfgId])
      mfgMap[mfgId] = rows[0] ?? { code: String(mfgId), name: String(mfgId) }
    }

    const conn: PoolConnection = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const isParentDraft = po.status === "draft"
      const childStatus   = isParentDraft ? "draft" : "raised"

      for (let i = 0; i < splits.length; i++) {
        const { mfg_id, destination, qty } = splits[i]
        const childPoNo = `${po.po_no}-S${String(i + 1).padStart(3, "0")}`
        const mfg = mfgMap[mfg_id]

        const [childResult] = await conn.execute(
          purchaseOrdersSql.insertSplit,
          [childPoNo, mfg_id, po.sku_code, Number(qty), po.expected_on, childStatus, destination || null]
        )
        const childId = (childResult as any).insertId

        // If parent was draft, each child needs its own approval record
        if (isParentDraft) {
          const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PO", childId, "create"])
          const approvalId = (ar as any).insertId
          const items: [string, string, string][] = [
            ["po_no",        "", childPoNo],
            ["manufacturer", "", `${mfg.code} — ${mfg.name}`],
            ["sku_code",     "", po.sku_code],
            ["qty",          "", String(qty)],
            ["expected_on",  "", po.expected_on || ""],
            ["destination",  "", destination || ""],
            ["split_from",   "", po.po_no],
          ]
          for (const [field, oldVal, newVal] of items) {
            await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, oldVal, newVal])
          }
        }
      }

      // Credit split qty to parent's received_qty — qty is never changed (it was emailed)
      await conn.execute(purchaseOrdersSql.incrementReceivedQtyBySplit, [splitTotal, poId])
      const newReceivedQty = Number(po.received_qty ?? 0) + splitTotal
      const newRemaining   = Number(po.qty) - newReceivedQty

      // Tolerance: min(100 units, 10% of original qty)
      // If remaining falls within tolerance, consider PO fully received.
      const originalQty = Number(po.qty)
      const tolerance   = Math.min(100, Math.floor(originalQty * 0.10))

      let splitType: "full" | "partial"
      if (newRemaining <= tolerance) {
        splitType = "full"
        await conn.execute(purchaseOrdersSql.setStatus, ["received", poId])
        logger.info({ ...logCtx, parentPoId: poId, newReceivedQty, newRemaining, tolerance, message: "Split within tolerance — parent marked received" })
      } else {
        splitType = "partial"
        logger.info({ ...logCtx, parentPoId: poId, newReceivedQty, newRemaining, tolerance, message: "Partial split — parent status unchanged" })
      }

      await conn.commit()
      recordProcessedEvent("PO_SPLIT", eventId, { parentPoId: poId, splitsCreated: splits.length, splitType })
      logger.info({ ...logCtx, parentPoId: poId, splitsCreated: splits.length, splitType, message: "PO split succeeded" })
      return NextResponse.json({ ok: true, splits_created: splits.length, split_type: splitType })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("PO_SPLIT", eventId, { parentPoId: poId, splits }, err.message)
      logger.error({ ...logCtx, parentPoId: poId, error: err.message, message: "PO split failed" })
      throw new ApiError(500, "internal", "Database error: " + err.message)
    } finally {
      conn.release()
    }
  },
})
