// ── PO (Impromptu purchase order — creation approval), PO_BULK (bulk CSV
// upload) ───────────────────────────────────────────────────────────────────
// PO: the PO is inserted as 'draft' before approval is submitted.
//     approve → set status to 'raised'   reject → set status to 'rejected'
//
// PO_BULK: no separate table needed. The S3 key and filename are stored
// directly as approval_items rows. entity_id = uploader's user id.
// applyAndArchive: reads s3_key from items, fetches the CSV from S3, parses
// each row, inserts all POs directly as 'raised'.
// Expected CSV columns (row 1 = header): mfg_code,sku_code,qty,expected_on,destination

import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { getFileBuffer } from "@/lib/s3"
import { recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import { type ModuleHandler } from "./types"

export const poHandler: ModuleHandler = {
  async setStatus(conn, entityId, status) {
    await conn.execute(purchaseOrdersSql.setStatus, [status, entityId])
  },
  async applyAndArchive(conn, entityId) {
    await conn.execute(purchaseOrdersSql.setStatus, ["raised", entityId])
  },
}

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

export const poBulkHandler: ModuleHandler = {
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
    const eventId = makeEventId("PO_BULK", "apply")
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
