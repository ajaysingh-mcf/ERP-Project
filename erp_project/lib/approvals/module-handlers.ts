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
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { getFileBuffer } from "@/lib/s3"
import { recordProcessedEvent, recordFailedEvent } from "@/lib/events"
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
    const vendorId = (vRows as any[])[0]?.vendor_id ?? 0

    await conn.execute(pmSql.archiveToHistoryMrm, [
      cur.mfg_id, cur.pm_id, vendorId,
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

// ── VENDOR (vendor master — spans master_vendors + details_vendor) ────────────

const VENDOR_DOC_FIELDS = new Set([
  "gst_certificate_key", "cancelled_cheque_key", "pan_card_key", "misc_document_key",
])

const vendorHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(vendorSql.setStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(vendorSql.selectById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`Vendor ${entityId} not found`)

    const hasFieldChange = items.some((i) => !VENDOR_DOC_FIELDS.has(i.field_name))
    const hasDocChange   = items.some((i) =>  VENDOR_DOC_FIELDS.has(i.field_name))

    if (hasFieldChange) {
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
    }

    if (hasDocChange) {
      const docVal = (field: string) => fieldMap[field] || cur[field] || null
      await conn.execute(vendorSql.updateDocuments, [
        docVal("gst_certificate_key"),
        docVal("cancelled_cheque_key"),
        docVal("pan_card_key"),
        docVal("misc_document_key"),
        entityId,
      ])
    }

    if (!hasFieldChange) {
      await conn.execute(vendorSql.setStatus, [STATUS.ACTIVE, entityId])
    }
  },
}

// ── MFG (manufacturer master — spans master_mfgs + details_mfg) ───────────────

const MFG_DOC_FIELDS = new Set([
  "gst_certificate_key", "cancelled_cheque_key", "pan_card_key", "misc_document_key",
])

const mfgHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(mfgSql.setStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId, items) {
    const fieldMap = buildFieldMap(items)
    const [rows] = await conn.execute(mfgSql.selectById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`Manufacturer ${entityId} not found`)

    const hasFieldChange = items.some((i) => !MFG_DOC_FIELDS.has(i.field_name))
    const hasDocChange   = items.some((i) =>  MFG_DOC_FIELDS.has(i.field_name))

    if (hasFieldChange) {
      await conn.execute(mfgSql.updateMfg, [fieldMap.name ?? cur.name, entityId])
      await conn.execute(mfgSql.updateMfgDetails, [
        fieldMap.location        ?? cur.location        ?? null,
        fieldMap.gst_number      ?? cur.gst_number      ?? null,
        STATUS.ACTIVE,
        fieldMap.registered_name ?? cur.registered_name ?? null,
        fieldMap.zone            ?? cur.zone            ?? null,
        fieldMap.bank_name       ?? cur.bank_name       ?? null,
        fieldMap.ifsc_number     ?? cur.ifsc_number     ?? null,
        fieldMap.account_number  ?? cur.account_number  ?? null,
        fieldMap.email           ?? cur.email           ?? null,
        entityId,
      ])
    }

    if (hasDocChange) {
      // Approval items store null as "" — convert back before writing to DB
      const docVal = (field: string) => fieldMap[field] || cur[field] || null
      await conn.execute(mfgSql.updateDocuments, [
        docVal("gst_certificate_key"),
        docVal("cancelled_cheque_key"),
        docVal("pan_card_key"),
        docVal("misc_document_key"),
        entityId,
      ])
    }

    // If only doc fields changed, updateMfgDetails wasn't called — set active explicitly
    if (!hasFieldChange) {
      await conn.execute(mfgSql.setStatus, [STATUS.ACTIVE, entityId])
    }
  },
}

// ── PO (Impromptu purchase order — creation approval) ─────────────────────────
// The PO is inserted as 'draft' before approval is submitted.
// approve → set status to 'raised'   reject → keep as 'draft'

const poHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(purchaseOrdersSql.setStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId) {
    await conn.execute(purchaseOrdersSql.setStatus, ["raised", entityId])
  },
}

// ── PO_BULK (bulk CSV upload — single approval for all POs in the file) ──────
// No separate table needed. The S3 key and filename are stored directly as
// approval_items rows. entity_id = uploader's user id.
// applyAndArchive: reads s3_key from items, fetches the CSV from S3, parses
// each row, inserts all POs directly as 'raised'.
// Expected CSV columns (row 1 = header): mfg_code,sku_code,qty,expected_on,destination

function parseCsv(text: string): string[][] {
  const result: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells: string[] = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        i++
        let val = ""
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { val += line[i++] }
        }
        cells.push(val)
        if (line[i] === ",") i++
      } else {
        const end = line.indexOf(",", i)
        if (end === -1) { cells.push(line.slice(i).trim()); break }
        cells.push(line.slice(i, end).trim()); i = end + 1
      }
    }
    result.push(cells)
  }
  return result
}

const poBulkHandler: ModuleHandler = {
  async setStatus() {
    // No separate entity table — nothing to update on reject
  },
  async applyAndArchive(conn, _entityId, items) {
    const s3Key = items.find((i) => i.field_name === "s3_key")?.new_value
    if (!s3Key) throw new Error("PO_BULK: s3_key not found in approval items")

    // ── Fetch and parse CSV from S3 BEFORE any DB work ────────────────────
    let csvText: string
    try {
      const buffer = await getFileBuffer(s3Key)
      csvText = buffer.toString("utf-8")
    } catch (err: any) {
      throw new Error(`PO_BULK: failed to fetch CSV from S3 (key=${s3Key}): ${err.message}`)
    }

    const allRows = parseCsv(csvText)
    console.log(`[PO_BULK] parsed CSV: ${allRows.length} total rows (incl. header), key=${s3Key}`)
    if (allRows.length < 2) throw new Error("PO_BULK: CSV has no data rows (only header or empty)")

    const dataRows = allRows.slice(1) // skip header
    const rows: { mfg_code: string; sku_code: string; qty: number; expected_on: string | null; destination: string | null }[] = []

    for (const cells of dataRows) {
      const mfg_code    = (cells[0] ?? "").trim()
      const sku_code    = (cells[1] ?? "").trim()
      const qty         = Number(cells[2] ?? 0)
      const expected_on = (cells[3] ?? "").trim() || null
      const destination = (cells[4] ?? "").trim() || null
      if (!mfg_code || !sku_code || qty <= 0) continue
      rows.push({ mfg_code, sku_code, qty, expected_on, destination })
    }

    if (rows.length === 0) throw new Error("PO_BULK: no valid data rows found — check mfg_code, sku_code, qty columns")
    console.log(`[PO_BULK] ${rows.length} valid rows to insert`)

    // ── DB work: count, look up MFG IDs, insert POs ───────────────────────
    const eventId = `po-bulk-apply-${Date.now()}`
    const year = new Date().getFullYear()
    const [cntRows] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE po_no LIKE 'PO-%'`, []
    )
    let seq = Number((cntRows as any[])[0]?.cnt ?? 0)
    const initialSeq = seq

    try {
      for (const row of rows) {
        const [mfgRows] = await conn.execute(
          `SELECT id FROM master_mfgs WHERE code = ? LIMIT 1`, [row.mfg_code]
        )
        const mfg = (mfgRows as any[])[0]
        if (!mfg) throw new Error(`PO_BULK: manufacturer not found for code="${row.mfg_code}" — check mfg_code column`)

        seq++
        const po_no = `PO-${year}-${seq.toString().padStart(3, "0")}`
        await conn.execute(purchaseOrdersSql.insertBulkPo, [
          po_no, mfg.id, row.sku_code, row.qty, row.expected_on, row.destination, s3Key,
        ])
        console.log(`[PO_BULK] inserted ${po_no} (mfg=${row.mfg_code} sku=${row.sku_code} qty=${row.qty})`)
      }

      console.log(`[PO_BULK] all ${rows.length} POs inserted, awaiting commit`)
      recordProcessedEvent("PO_BULK", eventId, {
        s3Key,
        totalDataRows:   rows.length,
        insertedCount:   seq - initialSeq,
        skippedDataRows: dataRows.length - rows.length,
      })
    } catch (err: any) {
      recordFailedEvent("PO_BULK", eventId, { s3Key, totalDataRows: rows.length }, err.message)
      throw err
    }
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
  PO:      poHandler,
  PO_BULK: poBulkHandler,
}
