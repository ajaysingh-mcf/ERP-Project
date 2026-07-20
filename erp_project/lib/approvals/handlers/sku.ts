// ── SKU ──────────────────────────────────────────────────────────────────────

import { skus as skuSql } from "@/lib/queries/skus"
import { STATUS } from "@/lib/constants"
import { type ModuleHandler, buildFieldMap } from "./types"

export const skuHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(skuSql.setStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items, approverId) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(skuSql.selectById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`SKU ${entityId} not found`)

    await conn.execute(skuSql.insertHistory, [
      cur.id, cur.sku_code, cur.name,
      cur.brand ?? null, cur.category ?? null, cur.status ?? null,
      approverId,
    ])
    await conn.execute(skuSql.updateSku, [
      fieldMap.name     ?? cur.name,
      fieldMap.brand    ?? cur.brand    ?? null,
      fieldMap.category ?? cur.category ?? null,
      STATUS.ACTIVE,
      entityId,
    ])
  },
}
