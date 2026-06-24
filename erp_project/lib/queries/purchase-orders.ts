/**
 * Purchase Orders Queries
 *
 * Real table: purchase_orders
 * Columns: id, po_no, mfg_id, date, sku_code, bom_id, qty, unit_price,
 *          total_amount, expected_on, received_qty, invoice_no, status
 */

export const purchaseOrdersSql = {
  /** All POs joined with manufacturer name, SKU name, and who originally raised each PO. */
  selectAll: `
    SELECT
      po.id,
      po.po_no,
      po.date,
      po.sku_code,
      po.qty,
      po.unit_price,
      po.total_amount,
      po.expected_on,
      po.received_qty,
      po.invoice_no,
      po.status,
      m.id   AS mfg_id,
      m.code AS mfg_code,
      m.name AS mfg_name,
      sk.name   AS sku_name,
      sk.status AS sku_status,
      (SELECT raised_by FROM approvals WHERE module = 'PO' AND entity_id = po.id ORDER BY id DESC LIMIT 1) AS po_raised_by
    FROM purchase_orders po
    INNER JOIN master_mfgs m  ON m.id        = po.mfg_id
    LEFT  JOIN master_skus sk ON sk.sku_code = po.sku_code
    ORDER BY po.date DESC, po.id DESC
  `,

  /** Count of impromptu POs (identified by IMP- prefix) — used for number generation. */
  countImpromptu: `
    SELECT COUNT(*) AS cnt FROM purchase_orders WHERE po_no LIKE 'IMP-%'
  `,

  /** Insert a new impromptu PO as draft (pending approval). Parameters: [po_no, mfg_id, sku_code, qty, expected_on] */
  insert: `
    INSERT INTO purchase_orders (po_no, mfg_id, date, sku_code, qty, expected_on, status)
    VALUES (?, ?, CURDATE(), ?, ?, ?, 'draft')
  `,

  /** Set status on a purchase_orders row. Parameters: [status, id] */
  setStatus: `UPDATE purchase_orders SET status = ? WHERE id = ?`,

  /** Fetch MFG name for readable approval diff. Parameters: [id] */
  selectById: `
    SELECT po.id, po.po_no, po.sku_code, po.qty, po.expected_on,
           m.code AS mfg_code, m.name AS mfg_name
    FROM purchase_orders po
    JOIN master_mfgs m ON m.id = po.mfg_id
    WHERE po.id = ? LIMIT 1
  `,

  /** Lightweight SKU list for the Impromptu PO dropdown (includes status for blocking non-active SKUs). */
  skuOptions: `
    SELECT id, sku_code, name, status
    FROM master_skus
    WHERE status NOT IN ('inactive', 'discontinued')
    ORDER BY sku_code ASC
  `,

  /** All active warehouses for the Split PO destination dropdown. */
  warehouseOptions: `
    SELECT id, name, location, zone, type
    FROM master_warehouse
    ORDER BY type DESC, name ASC
  `,

  /** Lightweight MFG list for the Impromptu PO dropdown. */
  mfgOptions: `
    SELECT m.id, m.code, m.name
    FROM master_mfgs m
    INNER JOIN details_mfg d ON d.mfg_id = m.id
    WHERE d.status = 'active'
    ORDER BY m.code ASC
  `,

  /** Update editable fields on a PO (draft/raised/punched). Parameters: [mfg_id, sku_code, qty, expected_on, id] */
  updateDraft: `
    UPDATE purchase_orders SET mfg_id = ?, sku_code = ?, qty = ?, expected_on = ?
    WHERE id = ?
  `,
}
