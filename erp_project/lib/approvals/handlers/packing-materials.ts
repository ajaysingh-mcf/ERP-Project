// ── PM_RATE (packing material × manufacturer rate), PM_VRM (× vendor rate),
// PM_MAT (base record), PM_BULK (bulk CSV upload) ─────────────────────────────

import { packingMaterials as pmSql } from "@/lib/queries/packing-materials"
import { parseS3Import } from "@/lib/import-s3"
import { recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import { STATUS } from "@/lib/constants"
import { roundToWholeNumber, roundToTwoDecimals } from "@/lib/numeric"
import { toPmParams } from "@/lib/master-routes/material-utils"
import { type ModuleHandler, buildFieldMap, s3KeyOf } from "./types"

export const pmRateHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(pmSql.setRateStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(pmSql.selectRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`PM rate ${entityId} not found`)

    const [vRows] = await conn.execute(pmSql.getVendorId, [cur.pm_id])
    const vendorId = (vRows as any[])[0]?.vendor_id ?? 0

    await conn.execute(pmSql.archiveToHistoryMrm, [
      cur.mfg_id, cur.pm_id, vendorId,
      cur.curr_rate, cur.effective_from, null,
      cur.status === STATUS.ACTIVE ? 1 : 0,
    ])
    await conn.execute(pmSql.updateMfgRate, [
      fieldMap.curr_rate      !== undefined ? roundToTwoDecimals(fieldMap.curr_rate) : cur.curr_rate,
      fieldMap.uom            ?? cur.uom,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
    await conn.execute(pmSql.setRateStatus, [STATUS.ACTIVE, entityId])
  },
}

export const pmVrmHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(pmSql.setVendorRateStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(pmSql.selectVendorRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`PM vendor rate ${entityId} not found`)

    await conn.execute(pmSql.archiveToHistoryVrm, [
      cur.pm_id, cur.vendor_id,
      cur.curr_rate, cur.effective_from, cur.effective_to, cur.status,
    ])
    await conn.execute(pmSql.updateVendorRate, [
      fieldMap.curr_rate      !== undefined ? roundToTwoDecimals(fieldMap.curr_rate) : cur.curr_rate,
      fieldMap.moq            !== undefined ? roundToWholeNumber(fieldMap.moq)       : cur.moq,
      fieldMap.uom            ?? cur.uom,
      STATUS.ACTIVE,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
  },
}

export const pmMatHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(pmSql.setBaseStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(pmSql.selectBaseById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`PM base record ${entityId} not found`)

    await conn.execute(pmSql.update, [
      fieldMap.name          ?? cur.name,
      fieldMap.type          ?? cur.type,
      fieldMap.uom           ?? cur.uom,
      fieldMap.status        ?? STATUS.ACTIVE,
      fieldMap.hsn_code      ?? cur.hsn_code,
      fieldMap.pantone_color ?? cur.pantone_color,
      entityId,
    ])
  },
}

// Same shape as every other *_BULK handler — see raw-materials.ts's
// rmBulkHandler doc comment for the full explanation.
export const pmBulkHandler: ModuleHandler = {
  async setStatus() {
    // No entity exists before approval — nothing to roll back on reject.
  },
  async applyAndArchive(conn, _entityId, items) {
    const s3Key = s3KeyOf(items, "PM_BULK")
    const rows = await parseS3Import(s3Key)
    if (rows.length === 0) throw new Error("PM_BULK: file has no data rows")

    const eventId = makeEventId("PM_BULK", "apply")
    let inserted = 0, skipped = 0
    try {
      for (const row of rows) {
        if (!row.name?.trim()) { skipped++; continue }
        try {
          await conn.execute(pmSql.insert, await toPmParams(conn, row, STATUS.ACTIVE))
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") { skipped++ } else { throw err }
        }
      }
      recordProcessedEvent("PM_BULK", eventId, { s3Key, inserted, skipped })
    } catch (err: any) {
      recordFailedEvent("PM_BULK", eventId, { s3Key }, err.message)
      throw err
    }
  },
}
