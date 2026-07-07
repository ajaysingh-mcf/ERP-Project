/**
 * Manufacturing Queries
 *
 * Real table: master_bom_mfg — the SKU (via master_bom) ↔ Manufacturer link,
 * joined for the Manufacturing module's per-manufacturer line list and the
 * cross-manufacturer overview. Open PO figures come from purchase_orders.
 *
 * master_bom_mfg columns: id, bom_id, mfg_id, status, effective_from,
 *   effective_to, monthly_capacity, this_month_plan, last_batch_date,
 *   remarks, created_on, created_by
 */

const LINES_SELECT = `
  SELECT
    l.id, l.bom_id, l.mfg_id, l.status, l.effective_from, l.effective_to,
    l.monthly_capacity, l.this_month_plan, l.last_batch_date, l.remarks,
    b.bom_code,
    sk.sku_code, sk.name AS sku_name, sk.brand,
    m.code AS mfg_code, m.name AS mfg_name
  FROM master_bom_mfg l
  INNER JOIN master_bom  b  ON b.id  = l.bom_id
  LEFT  JOIN master_skus sk ON sk.id = b.sku_id
  INNER JOIN master_mfgs m  ON m.id  = l.mfg_id
`

export const manufacturingSql = {
  /**
   * All lines for one manufacturer, optionally filtered by status.
   * Params: [mfg_id, status, status]  (status is null to disable the filter)
   */
  selectLinesByMfg: `
    ${LINES_SELECT}
    WHERE l.mfg_id = ? AND (? IS NULL OR l.status = ?)
    ORDER BY sk.sku_code ASC
  `,

  /** Per-status line counts for one manufacturer's tab badges. Params: [mfg_id] */
  statusCountsByMfg: `
    SELECT l.status, COUNT(*) AS cnt
    FROM master_bom_mfg l
    WHERE l.mfg_id = ?
    GROUP BY l.status
  `,

  /**
   * One row per active manufacturer with aggregated production + PO stats.
   * Production-share / fill-rate percentages are derived in application code
   * from these sums, not stored.
   */
  overviewByMfg: `
    SELECT
      m.id, m.code, m.name,
      COALESCE(SUM(CASE WHEN l.status = 'active' THEN l.monthly_capacity ELSE 0 END), 0) AS capacity,
      COALESCE(SUM(CASE WHEN l.status = 'active' THEN l.this_month_plan  ELSE 0 END), 0) AS this_month_plan,
      COUNT(CASE WHEN l.status = 'active' THEN 1 END) AS active_skus,
      COALESCE(po.open_pos, 0)   AS open_pos,
      COALESCE(po.open_value, 0) AS open_value
    FROM master_mfgs m
    INNER JOIN details_mfg d ON d.mfg_id = m.id
    LEFT JOIN master_bom_mfg l ON l.mfg_id = m.id
    LEFT JOIN (
      SELECT mfg_id,
        COUNT(*) AS open_pos,
        SUM(COALESCE(total_amount, 0)) AS open_value
      FROM purchase_orders
      WHERE status NOT IN ('received', 'cancelled')
      GROUP BY mfg_id
    ) po ON po.mfg_id = m.id
    WHERE d.status = 'active'
    GROUP BY m.id, m.code, m.name, po.open_pos, po.open_value
    ORDER BY m.code ASC
  `,

  /** Active manufacturers for the sidebar's dynamic MFG Management tabs. */
  selectActiveForNav: `
    SELECT m.id, m.name
    FROM master_mfgs m
    INNER JOIN details_mfg d ON d.mfg_id = m.id
    WHERE d.status = 'active'
    ORDER BY m.code ASC
  `,

  /** BOM options for the "Add line" dialog — active BOMs not yet linked to this manufacturer. Params: [mfg_id] */
  bomOptionsForMfg: `
    SELECT b.id, b.bom_code, sk.sku_code, sk.name AS sku_name
    FROM master_bom b
    LEFT JOIN master_skus sk ON sk.id = b.sku_id
    WHERE b.status = 'active'
      AND b.id NOT IN (SELECT bom_id FROM master_bom_mfg WHERE mfg_id = ?)
    ORDER BY sk.sku_code ASC
  `,

  /**
   * Insert a new manufacturer↔BOM line.
   * Params: [bom_id, mfg_id, status, effective_from, monthly_capacity, this_month_plan, last_batch_date, remarks, created_by]
   */
  insertLine: `
    INSERT INTO master_bom_mfg
      (bom_id, mfg_id, status, effective_from, monthly_capacity, this_month_plan, last_batch_date, remarks, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Update an existing line's editable fields.
   * Params: [status, monthly_capacity, this_month_plan, last_batch_date, remarks, id]
   */
  updateLine: `
    UPDATE master_bom_mfg
    SET status = ?, monthly_capacity = ?, this_month_plan = ?, last_batch_date = ?, remarks = ?
    WHERE id = ?
  `,

  /** Fetch a single line by id — used to confirm ownership/mfg_id before update. Params: [id] */
  selectLineById: `
    SELECT id, bom_id, mfg_id FROM master_bom_mfg WHERE id = ? LIMIT 1
  `,
}
