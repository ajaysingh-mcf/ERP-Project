// POST /api/masters/bom-master
//
// Two actions backing the BOM creation wizard (app/masters/bom-master/BomCreationWizard.tsx):
//   check-existing — dry-run, fired the instant a SKU is picked (Step 1), tells
//                    the wizard whether that SKU already has an active BOM.
//   create-full    — single atomic submit for BOTH "new-version" and
//                    "update-existing", from either manual entry or the CSV
//                    step. Inserts/locks the master_bom header and raises one
//                    approval encoding the full RM/PM line diff, plus any
//                    staged artifact add/remove, as approval_items —
//                    details_bom/bom_artifacts are only written at approval
//                    time (see lib/approvals/module-handlers.ts).
//   update-status  — direct, immediate master_bom.status change from the Edit
//                    BOM dialog. No approval gate (unlike create-full) —
//                    blocked only while an approval is already pending for
//                    this BOM. Setting "active" also deactivates any other
//                    active BOM for the same SKU, same invariant as
//                    bomHandler.applyAndArchive enforces on approval.
//
// This replaces the old action:"create"/"bulk" pair, which inserted directly
// with no approval gate and referenced non-existent master_bom.sku_code/mfg_id
// columns (broken against the real schema — see lib/queries/bom.ts).

import { NextResponse } from "next/server"
import type { PoolConnection } from "mysql2/promise"
import { pool, query } from "@/lib/db"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { bomActionSchema } from "@/lib/validation/bom"
import { bom as bomSql, BOM_STATUS_IN_REVIEW } from "@/lib/queries/bom"
import { approvalsSql } from "@/lib/queries/approvals"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import logger from "@/lib/logger"

export const POST = withGateway({
  schema: bomActionSchema,
  access: { pageSlug: "/masters/bom-master", level: "editor" },
  handler: async ({ body, session, ctx }) => {
    const userId = Number(session.user.id)

    // ── check-existing: dry-run, no mutation ──────────────────────────────
    if (body.action === "check-existing") {
      const rows = await query<{ bom_id: number; bom_code: string; status: string }>(
        bomSql.selectActiveBomBySkuId,
        [body.sku_id]
      )
      const active = rows[0] ?? null
      return NextResponse.json({
        hasActive: !!active,
        bom_id: active?.bom_id ?? null,
        bom_code: active?.bom_code ?? null,
      })
    }

    // ── create-full: single atomic submit ─────────────────────────────────
    if(body.action == "create-full") {
      const eventId = makeEventId("BOM", "submit", body.sku_id)
      const logCtx = { ...ctx, eventId, module: "BOM" }
      logger.info({ ...logCtx, skuId: body.sku_id, mode: body.mode, lineCount: body.rm_lines.length + body.pm_lines.length, message: "BOM submit started" })
      recordRawEvent("BOM", eventId, { skuId: body.sku_id, mode: body.mode, lineCount: body.rm_lines.length + body.pm_lines.length, source: body.source })

      const conn: PoolConnection = await pool.getConnection()
      await conn.beginTransaction()
      try {
        let bomId: number

        if (body.mode === "new-version") {
          const [result] = await conn.execute(bomSql.insertBomHeader, [
            body.bom_code!.trim(), body.sku_id, userId, BOM_STATUS_IN_REVIEW,
          ])
          bomId = (result as any).insertId
        } else {
          bomId = body.bom_id!
          const [rows] = await conn.execute(bomSql.selectBomHeaderRawById, [bomId])
          const cur = (rows as any[])[0]
          if (!cur) throw new ApiError(404, "not_found", "BOM not found.")
          if (cur.sku_id !== body.sku_id) {
            throw new ApiError(400, "sku_mismatch", "This BOM does not belong to the selected SKU.")
          }
          const pending = await query(approvalsSql.hasPending, ["BOM", bomId])
          if (pending.length > 0) {
            throw new ApiError(409, "pending_approval", "This BOM already has a pending approval.")
          }
          await conn.execute(bomSql.setBomStatus, [BOM_STATUS_IN_REVIEW, bomId])
        }

        // Diff against the CURRENT lines for update-existing (real old values,
        // rmVrmHandler-style); for new-version there is no prior state, so
        // every field's old_value is "" (MFG "diff from nothing" style).
        let currentByKey = new Map<string, any>()
        if (body.mode === "update-existing") {
          const [curRows] = await conn.execute(bomSql.selectDetailLinesRawByBomId, [bomId])
          currentByKey = new Map((curRows as any[]).map((r) => [`${r.mtrl_type}:${r.mtrl_id}`, r]))
        }

        const [approvalResult] = await conn.execute(
          approvalsSql.insertApproval,
          [userId, "BOM", bomId, body.mode === "new-version" ? "create" : "edit"]
        )
        const approvalId = (approvalResult as any).insertId
        await conn.execute(approvalsSql.insertApprovalItem, [approvalId, "__mode__", "", body.mode])

        const allLines = [...body.rm_lines, ...body.pm_lines]
        const seenKeys = new Set<string>()
        for (const line of allLines) {
          const key = `${line.mtrl_type}:${line.mtrl_id}`
          seenKeys.add(key)
          const cur = currentByKey.get(key)
          // Always write a marker for this line, even with zero changed
          // fields — otherwise a line resubmitted unchanged has NO
          // approval_item at all, parseBomLineItems never sees it, and
          // applyAndArchive's wipe-then-reinsert-from-diff step would drop
          // it permanently. This is what makes an "artifact-only" edit (no
          // line changes) safe to bundle into the same create-full submit.
          await conn.execute(approvalsSql.insertApprovalItem, [
            approvalId, `line:${line.mtrl_type}:${line.mtrl_id}:__present__`, "1", "1",
          ])
          const fieldVals: [string, string][] = [
            ["amount", String(line.amount)],
            ["uom", line.uom ?? ""],
            ["effective_from", line.effective_from],
            ["effective_till", line.effective_till ?? ""],
          ]
          for (const [field, newVal] of fieldVals) {
            const oldVal = cur ? String(cur[field] ?? "") : ""
            if (oldVal !== newVal) {
              await conn.execute(approvalsSql.insertApprovalItem, [
                approvalId, `line:${line.mtrl_type}:${line.mtrl_id}:${field}`, oldVal, newVal,
              ])
            }
          }
        }
        // Lines present in the current BOM but absent from this submission
        // (update-existing only) — mark as removed so applyAndArchive drops them.
        for (const [key] of currentByKey) {
          if (!seenKeys.has(key)) {
            const [mtrlType, mtrlId] = key.split(":")
            await conn.execute(approvalsSql.insertApprovalItem, [
              approvalId, `line:${mtrlType}:${mtrlId}:__removed__`, "1", "",
            ])
          }
        }

        // Artifacts (bom_artifacts) are bundled into this same approval —
        // actually written/deleted only at approval time, see
        // bomHandler.applyAndArchive.
        for (const [i, artifact] of (body.artifact_adds ?? []).entries()) {
          await conn.execute(approvalsSql.insertApprovalItem, [
            approvalId, `artifact:add:${i}`, "", JSON.stringify(artifact),
          ])
        }
        for (const artifactId of body.artifact_removes ?? []) {
          await conn.execute(approvalsSql.insertApprovalItem, [
            approvalId, `artifact:remove:${artifactId}`, "1", "",
          ])
        }

        await conn.commit()
        logger.info({ ...logCtx, bomId, approvalId, message: "BOM submitted for approval" })
        recordProcessedEvent("BOM", eventId, { bomId, approvalId, skuId: body.sku_id, mode: body.mode })
        return NextResponse.json({ ok: true, bom_id: bomId, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("BOM", eventId, { skuId: body.sku_id, mode: body.mode }, err.message)
        logger.error({ ...logCtx, err: err.message, message: "BOM submit failed" })
        if (err instanceof ApiError) throw err
        throw new ApiError(500, "internal", "Database error: " + err.message)
      } finally {
        conn.release()
      }
    }

    // ── update-status: direct, immediate status change (no approval gate) ──
    if (body.action === "update-status") {
      const { bom_id, status } = body
      const eventId = makeEventId("BOM", "status", bom_id)
      const logCtx = { ...ctx, eventId, module: "BOM" }

      const pending = await query(approvalsSql.hasPending, ["BOM", bom_id])
      if (pending.length > 0) {
        throw new ApiError(409, "pending_approval", "This BOM has a pending approval — resolve it before changing status directly.")
      }

      const conn: PoolConnection = await pool.getConnection()
      await conn.beginTransaction()
      try {
        const [rows] = await conn.execute(bomSql.selectBomHeaderRawById, [bom_id])
        const cur = (rows as any[])[0]
        if (!cur) throw new ApiError(404, "not_found", "BOM not found.")

        await conn.execute(bomSql.setBomStatusWithUpdater, [status, userId, bom_id])

        // Manually activating a BOM must still respect "only one active BOM
        // per SKU" — the same invariant bomHandler.applyAndArchive enforces
        // on approval — otherwise downstream costing/reporting queries that
        // join details_bom on status='active' assuming a single row break.
        if (status === "active" && cur.sku_id) {
          const [siblingRows] = await conn.execute(bomSql.selectOtherActiveBomsForSku, [cur.sku_id, bom_id])
          const siblingIds = (siblingRows as any[]).map((r) => r.id)
          if (siblingIds.length > 0) {
            await conn.execute(bomSql.deactivateOtherActiveBomsForSku, [cur.sku_id, bom_id])
            for (const siblingId of siblingIds) {
              const deactivateEventId = makeEventId("BOM", "deactivate", siblingId)
              logger.info({ module: "BOM", eventId: deactivateEventId, bomId: siblingId, skuId: cur.sku_id, supersededBy: bom_id, message: "BOM deactivated (superseded by manual status change)" })
              recordProcessedEvent("BOM", deactivateEventId, { bomId: siblingId, skuId: cur.sku_id, supersededBy: bom_id })
            }
          }
        }

        await conn.commit()
        logger.info({ ...logCtx, bomId: bom_id, status, message: "BOM status updated manually" })
        recordProcessedEvent("BOM", eventId, { bomId: bom_id, status })
        return NextResponse.json({ ok: true })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("BOM", eventId, { bomId: bom_id, status }, err.message)
        logger.error({ ...logCtx, err: err.message, message: "BOM status update failed" })
        if (err instanceof ApiError) throw err
        throw new ApiError(500, "internal", "Database error: " + err.message)
      } finally {
        conn.release()
      }
    }

    return NextResponse.json({ ok: false, message: "Invalid action" }, { status: 400 })
  },
})
