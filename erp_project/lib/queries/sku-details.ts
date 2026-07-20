/**
 * SKU Details Queries — mcaff_dwh.All_Product_Name_MRP_Mapping
 *
 * Read-only source for the SKU master page (list/search/export). Columns are
 * aliased to match the `Sku` type (types/masters.ts) so downstream code
 * (SkusClient, SKU_EXPORT_COLUMNS) is unaffected by the swap.
 *
 * `Enabled` ("Yes"/"No") + `end_date` are mapped to active/discontinued/inactive:
 *   - Enabled='Yes'                        -> active
 *   - Enabled='No' AND end_date < NOW()    -> discontinued
 *   - otherwise (Enabled='No', no/future end_date) -> inactive
 * The DWH table has no created_at/created_by concept, so those come back null.
 * Additional useful DWH columns are surfaced too: Sub_category, MRP, HSN, Launch_Date.
 *
 * Runs against `queryDwh` (lib/db-sku.ts), NOT the primary `query`/`execute`
 * from lib/db.ts. SKU writes/approvals still target master_skus unchanged.
 *
 * The DWH table has MULTIPLE rows per Sku_code — one per external
 * marketplace/channel mapping key (ASIN, Shopify id, ...), plus historical
 * price rows keyed by [start_date, end_date] (see scripts/sync-skus-from-dwh.ts,
 * which hit the same shape). Without deduping, this page showed every
 * duplicate instead of just the current one. LATEST_SKU below picks, per
 * Sku_code, the row(s) from the latest end_date window (the currently-
 * effective period), then MAX()-collapses any remaining duplicate rows in
 * that window — their core fields agree in all but a handful of known
 * source data-quality exceptions.
 */

const STATUS_EXPR = `
  CASE
    WHEN d.Enabled = 'Yes' THEN 'active'
    WHEN d.Enabled = 'No' AND d.end_date < NOW() THEN 'discontinued'
    ELSE 'inactive'
  END
`

const LATEST_SKU = `(
  SELECT
    d.Sku_code             AS sku_code,
    MAX(d.\`Index\`)        AS id,
    MAX(d.SKU_Name_Fixed)   AS name,
    MAX(d.Brand)            AS brand,
    MAX(d.Category)         AS category,
    MAX(${STATUS_EXPR})     AS status,
    MAX(d.Sub_category)     AS sub_category,
    MAX(d.MRP)              AS mrp,
    MAX(d.HSN)              AS hsn,
    MAX(d.Launch_Date)      AS launch_date
  FROM All_Product_Name_MRP_Mapping d
  INNER JOIN (
    SELECT Sku_code, MAX(end_date) AS max_end
    FROM All_Product_Name_MRP_Mapping
    GROUP BY Sku_code
  ) latest ON latest.Sku_code = d.Sku_code AND latest.max_end <=> d.end_date
  GROUP BY d.Sku_code
)`

const SELECT_COLUMNS = `
  id, sku_code, name, brand, category, status,
  NULL AS created_at,
  NULL AS created_by,
  sub_category, mrp, hsn, launch_date
`

export const skuDetails = {
  /**
   * Paginated SKU list with optional search + status + brand filter.
   * Params: [like, like, like, like, status, status, brand, brand, LIMIT, OFFSET]
   *   like   — '%search%' or null (sku_code / name / brand columns)
   *   status — 'active'|'inactive'|'discontinued' or null
   *   brand  — exact Brand value or null
   */
  selectPaginated: `
    SELECT ${SELECT_COLUMNS}
    FROM ${LATEST_SKU} latest_sku
    WHERE (? IS NULL OR sku_code LIKE ? OR name LIKE ? OR brand LIKE ?)
      AND (? IS NULL OR status = ?)
      AND (? IS NULL OR brand = ?)
    ORDER BY sku_code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Fetch ALL matching SKUs for the fuzzy-search path and for export (no LIMIT/OFFSET).
   * Params: [like, like, like, like, status, status, brand, brand]
   */
  selectAllFiltered: `
    SELECT ${SELECT_COLUMNS}
    FROM ${LATEST_SKU} latest_sku
    WHERE (? IS NULL OR sku_code LIKE ? OR name LIKE ? OR brand LIKE ?)
      AND (? IS NULL OR status = ?)
      AND (? IS NULL OR brand = ?)
    ORDER BY sku_code ASC
  `,

  /**
   * Matching COUNT for selectPaginated.
   * Params: [like, like, like, like, status, status, brand, brand]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM ${LATEST_SKU} latest_sku
    WHERE (? IS NULL OR sku_code LIKE ? OR name LIKE ? OR brand LIKE ?)
      AND (? IS NULL OR status = ?)
      AND (? IS NULL OR brand = ?)
  `,
}
