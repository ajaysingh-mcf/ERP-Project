/**
 * Purchase Orders Queries
 *
 * Real table: purchase_orders
 * Columns: id, po_no, mfg_id, date, sku_code, bom_id, qty, unit_price,
 *          total_amount, expected_on, received_qty, invoice_no, status,
 *          po_type, email_sent_at, attachment_key
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
      po.destination,
      po.status,
      po.po_type,
      po.attachment_key,
      po.csv_source_key,
      po.email_sent_at,
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

  /** Count of normal POs (PO- prefix) — used for PO-YYYY-NNN number generation. */
  countNormal: `
    SELECT COUNT(*) AS cnt FROM purchase_orders WHERE po_no LIKE 'PO-%'
  `,

  /** Insert an impromptu PO as draft (pending approval). Parameters: [po_no, mfg_id, sku_code, qty, expected_on, po_type, destination] */
  insert: `
    INSERT INTO purchase_orders (po_no, mfg_id, date, sku_code, qty, expected_on, status, po_type, destination)
    VALUES (?, ?, CURDATE(), ?, ?, ?, 'draft', ?, ?)
  `,

  /** Insert a normal PO directly as raised (no approval needed). Parameters: [po_no, mfg_id, sku_code, qty, expected_on, destination] */
  insertNormal: `
    INSERT INTO purchase_orders (po_no, mfg_id, date, sku_code, qty, expected_on, status, po_type, destination)
    VALUES (?, ?, CURDATE(), ?, ?, ?, 'raised', 'normal', ?)
  `,

  /** Set status on a purchase_orders row. Parameters: [status, id] */
  setStatus: `UPDATE purchase_orders SET status = ? WHERE id = ?`,

  /** Stamp email_sent_at on first send only. Parameters: [id] */
  setEmailSentAt: `UPDATE purchase_orders SET email_sent_at = NOW() WHERE id = ? AND email_sent_at IS NULL`,

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

  /** Lightweight PO fetch used for status checks and po_no retrieval. Parameters: [id] */
  selectForEdit: `
    SELECT id, po_no, status FROM purchase_orders WHERE id = ? LIMIT 1
  `,

  /** Fetch the user who originally submitted this PO. Parameters: [po_id] */
  selectRaisedBy: `
    SELECT raised_by FROM approvals
    WHERE module = 'PO' AND entity_id = ?
    ORDER BY id DESC LIMIT 1
  `,

  /** Full PO row for split operations. Parameters: [id] */
  selectForSplit: `
    SELECT id, po_no, mfg_id, sku_code, qty, received_qty, expected_on, status
    FROM purchase_orders WHERE id = ? LIMIT 1
  `,

  /** Insert a split child PO with an explicit status. Parameters: [po_no, mfg_id, sku_code, qty, expected_on, status, destination] */
  insertSplit: `
    INSERT INTO purchase_orders (po_no, mfg_id, date, sku_code, qty, expected_on, status, destination)
    VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?)
  `,

  /** Insert a PO directly as 'raised' for the bulk CSV approval flow. Parameters: [po_no, mfg_id, sku_code, qty, expected_on, destination, csv_source_key] */
  insertBulkPo: `
    INSERT INTO purchase_orders (po_no, mfg_id, date, sku_code, qty, expected_on, status, po_type, destination, csv_source_key)
    VALUES (?, ?, CURDATE(), ?, ?, ?, 'raised', 'normal', ?, ?)
  `,

  /** Update editable fields on a PO (draft/raised/punched). Parameters: [mfg_id, sku_code, qty, expected_on, destination, id] */
  updateDraft: `
    UPDATE purchase_orders SET mfg_id = ?, sku_code = ?, qty = ?, expected_on = ?, destination = ?
    WHERE id = ?
  `,

  /** Full PO data for email generation and PDF rendering. Parameters: [po_id] */
  selectForEmail: `
    SELECT
      po.po_no, po.date, po.expected_on, po.destination,
      po.sku_code, po.qty, po.unit_price, po.total_amount,
      sk.name            AS sku_name,
      m.code             AS mfg_code,
      m.name             AS mfg_name,
      d.registered_name, d.gst_number, d.location, d.email AS mfg_email,
      wh.location        AS dest_location,
      u.name             AS raised_by_name
    FROM purchase_orders po
    INNER JOIN master_mfgs      m  ON m.id          = po.mfg_id
    INNER JOIN details_mfg      d  ON d.mfg_id      = m.id
    LEFT  JOIN master_skus      sk ON sk.sku_code    = po.sku_code
    LEFT  JOIN master_warehouse wh ON wh.name        = po.destination
    LEFT  JOIN (
      SELECT entity_id, raised_by FROM approvals
      WHERE module = 'PO'
      ORDER BY id DESC
    ) latest ON latest.entity_id = po.id
    LEFT  JOIN users u ON u.id = latest.raised_by
    WHERE po.id = ?
    LIMIT 1
  `,
}
