/**
 * Approval Module Handlers — Strategy Pattern
 *
 * Each entry in MODULE_HANDLERS owns the full approve/reject logic for one
 * module code. Adding a new module means adding one object here; the route
 * handler never changes.
 *
 * Interface:
 *   setStatus       — called on reject: reverts entity to "draft"
 *   applyAndArchive — called on approve: archives old snapshot, applies diff
 *
 * All methods run inside the caller's open transaction. They must NOT call
 * beginTransaction / commit / rollback — that is the route handler's job.
 */

import type { PoolConnection } from "mysql2/promise"
import { skus as skuSql } from "@/lib/queries/skus"
import { rawMaterials as rmSql } from "@/lib/queries/raw-materials"
import { packingMaterials as pmSql } from "@/lib/queries/packing-materials"
import { vendors as vendorSql } from "@/lib/queries/vendors"
import { manufacturers as mfgSql } from "@/lib/queries/manufacturers"
import { STATUS } from "@/lib/constants"

export type DiffItem = { field_name: string; old_value: string; new_value: string }

export interface ModuleHandler {
  setStatus(conn: PoolConnection, entityId: number, status: string): Promise<void>
  applyAndArchive(
    conn: PoolConnection,
    entityId: number,
    items: DiffItem[],
    approverId: number
  ): Promise<void>
}

function buildFieldMap(items: DiffItem[]): Record<string, string> {
  return Object.fromEntries(items.map((i) => [i.field_name, i.new_value]))
}

// ── SKU ──────────────────────────────────────────────────────────────────────

const skuHandler: ModuleHandler = {
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

// ── RM_RATE (raw material × manufacturer rate) ────────────────────────────────

const rmRateHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(rmSql.setRateStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(rmSql.selectRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`RM rate ${entityId} not found`)

    await conn.execute(rmSql.archiveToHistoryMrm, [
      cur.mfg_id, cur.rm_id, cur.approved_vendor_id ?? 0,
      cur.curr_rate, cur.effective_from, null,
      cur.status === STATUS.ACTIVE ? 1 : 0,
    ])
    await conn.execute(rmSql.updateMfgRate, [
      fieldMap.curr_rate      !== undefined ? Number(fieldMap.curr_rate) : cur.curr_rate,
      fieldMap.uom            ?? cur.uom,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
    await conn.execute(rmSql.setRateStatus, [STATUS.ACTIVE, entityId])
  },
}

// ── PM_RATE (packing material × manufacturer rate) ────────────────────────────

const pmRateHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(pmSql.setRateStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(pmSql.selectRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`PM rate ${entityId} not found`)

    const [vRows] = await conn.execute(pmSql.getVendorId, [cur.pm_id])
    const historyVendorId = (vRows as any[])[0]?.vendor_id ?? 0

    await conn.execute(pmSql.archiveToHistoryMrm, [
      cur.mfg_id, cur.pm_id, historyVendorId,
      cur.curr_rate, cur.effective_from, null,
      cur.status === STATUS.ACTIVE ? 1 : 0,
    ])
    await conn.execute(pmSql.updateMfgRate, [
      fieldMap.curr_rate      !== undefined ? Number(fieldMap.curr_rate) : cur.curr_rate,
      fieldMap.uom            ?? cur.uom,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
    await conn.execute(pmSql.setRateStatus, [STATUS.ACTIVE, entityId])
  },
}

// ── RM_VRM (raw material × vendor rate) ──────────────────────────────────────

const rmVrmHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(rmSql.setVendorRateStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(rmSql.selectVendorRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`RM vendor rate ${entityId} not found`)

    await conn.execute(rmSql.archiveToHistoryVrm, [
      cur.rm_id, cur.vendor_id,
      cur.curr_rate, cur.effective_from, cur.effective_to, cur.status,
    ])
    await conn.execute(rmSql.updateVendorRate, [
      fieldMap.curr_rate      !== undefined ? Number(fieldMap.curr_rate) : cur.curr_rate,
      fieldMap.moq            !== undefined ? Number(fieldMap.moq)       : cur.moq,
      fieldMap.uom            ?? cur.uom,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
    await conn.execute(rmSql.setVendorRateStatus, [STATUS.ACTIVE, entityId])
  },
}

// ── PM_VRM (packing material × vendor rate) ───────────────────────────────────

const pmVrmHandler: ModuleHandler = {
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
      fieldMap.curr_rate      !== undefined ? Number(fieldMap.curr_rate) : cur.curr_rate,
      fieldMap.moq            !== undefined ? Number(fieldMap.moq)       : cur.moq,
      fieldMap.uom            ?? cur.uom,
      STATUS.ACTIVE,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
  },
}

// ── RM_MAT (raw material base record) ────────────────────────────────────────

const rmMatHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(rmSql.setBaseStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(rmSql.selectBaseById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`RM base record ${entityId} not found`)

    await conn.execute(rmSql.update, [
      fieldMap.name      ?? cur.name,
      fieldMap.make      ?? cur.make,
      fieldMap.type      ?? cur.type,
      fieldMap.uom       ?? cur.uom,
      fieldMap.status    ?? STATUS.ACTIVE,
      fieldMap.hsn_code  ?? cur.hsn_code,
      fieldMap.inci_name ?? cur.inci_name,
      entityId,
    ])
  },
}

// ── PM_MAT (packing material base record) ────────────────────────────────────

const pmMatHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(pmSql.setBaseStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(pmSql.selectBaseById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`PM base record ${entityId} not found`)

    await conn.execute(pmSql.update, [
      fieldMap.name     ?? cur.name,
      fieldMap.type     ?? cur.type,
      fieldMap.uom      ?? cur.uom,
      fieldMap.status   ?? STATUS.ACTIVE,
      fieldMap.hsn_code ?? cur.hsn_code,
      entityId,
    ])
  },
}

// ── VENDOR (vendor master — spans master_vendors + details_vendor) ────────────

const vendorHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(vendorSql.setStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(vendorSql.selectById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`Vendor ${entityId} not found`)

    await conn.execute(vendorSql.updateVendor, [
      fieldMap.name ?? cur.name,
      fieldMap.type ?? cur.type,
      entityId,
    ])
    await conn.execute(vendorSql.updateVendorDetails, [
      fieldMap.location        ?? cur.location        ?? null,
      STATUS.ACTIVE,
      fieldMap.zone            ?? cur.zone            ?? null,
      fieldMap.registered_name ?? cur.registered_name ?? null,
      entityId,
    ])
  },
}

// ── MFG (manufacturer master — spans master_mfgs + details_mfg) ───────────────

const mfgHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(mfgSql.setStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(mfgSql.selectById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`Manufacturer ${entityId} not found`)

    await conn.execute(mfgSql.updateMfg, [
      fieldMap.name ?? cur.name,
      entityId,
    ])
    await conn.execute(mfgSql.updateMfgDetails, [
      fieldMap.location        ?? cur.location        ?? null,
      fieldMap.gst_number      ?? cur.gst_number      ?? null,
      STATUS.ACTIVE,
      fieldMap.registered_name ?? cur.registered_name ?? null,
      fieldMap.zone            ?? cur.zone            ?? null,
      fieldMap.bank_name       ?? cur.bank_name       ?? null,
      fieldMap.ifsc_number     ?? cur.ifsc_number     ?? null,
      fieldMap.account_number  ?? cur.account_number  ?? null,
      entityId,
    ])
  },
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const MODULE_HANDLERS: Record<string, ModuleHandler> = {
  SKU:     skuHandler,
  RM_RATE: rmRateHandler,
  PM_RATE: pmRateHandler,
  RM_VRM:  rmVrmHandler,
  PM_VRM:  pmVrmHandler,
  RM_MAT:  rmMatHandler,
  PM_MAT:  pmMatHandler,
  VENDOR:  vendorHandler,
  MFG:     mfgHandler,
}
