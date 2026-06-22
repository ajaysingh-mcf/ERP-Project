/**
 * SKU Queries
 *
 * Centralised queries for the `skus` table.
 * Previously the SELECT SQL lived inline in app/masters/skus/page.tsx;
 * moved here to follow the same pattern as every other master module.
 */

export const skus = {
  // ============ SELECT QUERIES ============

  /** Get all SKUs — used by CSV / Add wizards that need the full list. */
  selectAll: `
    SELECT id, sku_code, name, brand, category, status, created_at, created_by
    FROM master_skus
    ORDER BY sku_code ASC
  `,

  // ============ PAGINATED SELECT QUERIES ============

  /**
   * Paginated SKU list with optional search + status filter.
   * Params: [like, like, like, like, status, status, LIMIT, OFFSET]
   *   like   — '%search%' or null (code / name / brand columns)
   *   status — 'active'|'inactive'|brand name or null
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
   * Matching COUNT for selectPaginated.
   * Params: [like, like, like, like, status, status]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM master_skus
    WHERE (? IS NULL OR sku_code LIKE ? OR name LIKE ? OR brand LIKE ?)
      AND (? IS NULL OR status = ?)
  `,
}
