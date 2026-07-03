// POST /api/masters/bom-master
//
// Two actions backing the BOM creation wizard (app/masters/bom-master/BomCreationWizard.tsx):
//   check-existing — dry-run, fired the instant a SKU is picked (Step 1), tells
//                    the wizard whether that SKU already has an active BOM.
//   create-full    — single atomic submit for BOTH "new-version" and
//                    "update-existing", from either manual entry or the CSV
//                    step. Inserts/locks the master_bom header and raises one
//                    approval encoding the full RM/PM line diff as
//                    approval_items — details_bom itself is only written at
//                    approval time (see lib/approvals/module-handlers.ts).
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

export const POST = withGateway({
  schema: bomActionSchema,
  access: { pageSlug: "/masters", level: "editor" },
  handler: async ({ body, session }) => {
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

      const [approvalResult] = await conn.execute(approvalsSql.insertApproval, [userId, "BOM", bomId])
      const approvalId = (approvalResult as any).insertId
      await conn.execute(approvalsSql.insertApprovalItem, [approvalId, "__mode__", "", body.mode])

      const allLines = [...body.rm_lines, ...body.pm_lines]
      const seenKeys = new Set<string>()
      for (const line of allLines) {
        const key = `${line.mtrl_type}:${line.mtrl_id}`
        seenKeys.add(key)
        const cur = currentByKey.get(key)
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

      await conn.commit()
      return NextResponse.json({ ok: true, bom_id: bomId, approval_id: approvalId })
    } catch (err: any) {
      await conn.rollback()
      if (err instanceof ApiError) throw err
      throw new ApiError(500, "internal", "Database error: " + err.message)
    } finally {
      conn.release()
    }
  },
})
