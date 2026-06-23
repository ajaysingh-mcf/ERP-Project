/**
 * BOM Queries
 * Centralized queries for the bom and bom_details tables
 *
 * Note: BOM data spans two tables:
 *   bom(id, bom_code, sku_code, mfg_id, status)
 *   bom_details(id, bom_id → bom.id, mtrl_type, mtrl_id, amount, uom, mtrl_cost, ...)
 */

export const bom = {
  // ============ SELECT QUERIES ============

  /**
   * Get all BOM records with detail lines joined.
   * Returns full columns from both bom and bom_details.
   */
  selectAll: `
    SELECT
      b.bom_code, bd.bom_id, s.sku_code,
      bd.mtrl_id, bd.mtrl_type, bd.uom, bd.amount,
      NULL AS mtrl_cost, bd.status AS material_status, b.status AS bom_status,
      bd.effective_from, bd.effective_till, bd.last_updated,
      b.created_by
    FROM details_bom AS bd
    INNER JOIN master_bom AS b ON b.id = bd.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    ORDER BY b.bom_code ASC
  `,

  // ============ PAGINATED SELECT QUERIES ============

  /**
   * Paginated BOM list with optional search, material-type, and status filters.
   * Params: [like, like, like, type, type, status, status, LIMIT, OFFSET]
   *   like   — '%search%' or null (bom_code / sku_code columns)
   *   type   — 'rm'|'pm' or null
   *   status — 'draft'|'active'|'inactive' or null
   */
  selectPaginated: `
    SELECT
      b.bom_code, bd.bom_id, s.sku_code,
      bd.mtrl_id, bd.mtrl_type, bd.uom, bd.amount,
      NULL AS mtrl_cost, bd.status AS material_status, b.status AS bom_status,
      bd.effective_from, bd.effective_till, bd.last_updated,
      b.created_by
    FROM details_bom AS bd
    INNER JOIN master_bom AS b ON b.id = bd.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
      AND (? IS NULL OR bd.mtrl_type = ?)
      AND (? IS NULL OR b.status = ?)
    ORDER BY b.bom_code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Matching COUNT for selectPaginated.
   * Params: [like, like, like, type, type, status, status]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM details_bom AS bd
    INNER JOIN master_bom AS b ON b.id = bd.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
      AND (? IS NULL OR bd.mtrl_type = ?)
      AND (? IS NULL OR b.status = ?)
  `,

  /**
   * Look up a BOM header by its code and linked SKU code.
   * Parameters: [bom_code, sku_code]
   */
  selectByBomCode: `
    SELECT * FROM master_bom WHERE bom_code = ? AND sku_code = ?
  `,

  // ============ INSERT QUERIES ============

  /**
   * Insert a BOM header record.
   * Parameters: [bom_code, sku_code, mfg_id, status]
   * Returns insertId to be used for insertBomDetail.
   */
  insertBom: `
    INSERT INTO master_bom (bom_code, sku_code, mfg_id, status)
    VALUES (?, ?, ?, ?)
  `,

  /**
   * Insert a single BOM detail line.
   * Parameters: [bom_id, mtrl_type, mtrl_id, amount, uom, mtrl_cost, effective_from, effective_till]
   */
  insertBomDetail: `
    INSERT INTO details_bom (bom_id, mtrl_type, mtrl_id, amount, uom, mtrl_cost, effective_from, effective_till)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
}
