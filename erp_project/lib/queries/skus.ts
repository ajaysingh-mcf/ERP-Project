/**
 * SKU Queries
 *
 * Centralised queries for the `skus` table and `sku_history` audit table.
 */

export const skus = {
  // ============ SELECT QUERIES ============

  /** Get all SKUs — used by CSV / Add wizards that need the full list. */
  selectAll: `
    SELECT id, sku_code, name, brand, category, status, created_at, created_by
    FROM master_skus
    ORDER BY sku_code ASC
  `,

  /**
   * Fetch a single SKU by id (used before update to snapshot for history).
   * Parameters: [id]
   */
  selectById: `
    SELECT id, sku_code, name, brand, category, status
    FROM master_skus WHERE id = ? LIMIT 1
  `,

  // ============ PAGINATED SELECT QUERIES ============

  /**
   * Paginated SKU list with optional search + status filter.
   * Params: [like, like, like, like, status, status, LIMIT, OFFSET]
   *   like   — '%search%' or null (code / name / brand columns)
   *   status — 'active'|'inactive' or null
   */
  selectPaginated: `
    SELECT id, sku_code, name, brand, category, status, created_at, created_by
    FROM master_skus
    WHERE (? IS NULL OR sku_code LIKE ? OR name LIKE ? OR brand LIKE ?)
      AND (? IS NULL OR status = ?)
    ORDER BY sku_code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Fetch ALL matching SKUs for export (no LIMIT/OFFSET).
   * Same WHERE clause as selectPaginated; call countAll first to enforce the
   * row cap before running this.
   * Params: [like, like, like, like, status, status]
   */
  selectAllFiltered: `
    SELECT id, sku_code, name, brand, category, status, created_at, created_by
    FROM master_skus
    WHERE (? IS NULL OR sku_code LIKE ? OR name LIKE ? OR brand LIKE ?)
      AND (? IS NULL OR status = ?)
    ORDER BY sku_code ASC
  `,

  /**
   * Matching COUNT for selectPaginated.
   * Params: [like, like, like, like, status, status]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM master_skus
    WHERE (? IS NULL OR sku_code LIKE ? OR name LIKE ? OR brand LIKE ?)
      AND (? IS NULL OR status = ?)
  `,

  // ============ UPDATE QUERIES ============

  /**
   * Update editable SKU fields (sku_code is immutable).
   * Parameters: [name, brand, category, status, id]
   */
  updateSku: `
    UPDATE master_skus
    SET name = ?, brand = ?, category = ?, status = ?
    WHERE id = ?
  `,

  // ============ HISTORY QUERIES ============

  /**
   * Archive the pre-edit snapshot of a SKU to sku_history.
   * Parameters: [sku_id, sku_code, name, brand, category, status, changed_by]
   */
  insertHistory: `
    INSERT INTO sku_history (sku_id, sku_code, name, brand, category, status, changed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,

  // ============ INSERT QUERIES ============

  /** Insert a new SKU row.
   *  Parameters: [sku_code, name, brand, category, status, created_by]
   */
  insertSku: `
    INSERT INTO master_skus (sku_code, name, brand, category, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `,

  // ── Approval-flow helpers ────────────────────────────────────────────────

  /** Set the status of a SKU (e.g. 'in_review', 'draft', 'active').
   *  Parameters: [status, id]
   */
  setStatus: `UPDATE master_skus SET status = ? WHERE id = ?`,

  /** Fetch SKU status by sku_code — used to gate PO creation. Parameters: [sku_code] */
  selectStatusByCode: `SELECT status FROM master_skus WHERE sku_code = ? LIMIT 1`,
}
