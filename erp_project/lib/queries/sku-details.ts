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
 */

const STATUS_EXPR = `
  CASE
    WHEN Enabled = 'Yes' THEN 'active'
    WHEN Enabled = 'No' AND end_date < NOW() THEN 'discontinued'
    ELSE 'inactive'
  END
`

const SELECT_COLUMNS = `
  \`Index\`       AS id,
  Sku_code        AS sku_code,
  SKU_Name_Fixed  AS name,
  Brand           AS brand,
  Category        AS category,
  ${STATUS_EXPR}  AS status,
  NULL            AS created_at,
  NULL            AS created_by,
  Sub_category    AS sub_category,
  MRP             AS mrp,
  HSN             AS hsn,
  Launch_Date     AS launch_date
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
    FROM All_Product_Name_MRP_Mapping
    WHERE (? IS NULL OR Sku_code LIKE ? OR SKU_Name_Fixed LIKE ? OR Brand LIKE ?)
      AND (? IS NULL OR ${STATUS_EXPR} = ?)
      AND (? IS NULL OR Brand = ?)
    ORDER BY Sku_code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Fetch ALL matching SKUs for the fuzzy-search path and for export (no LIMIT/OFFSET).
   * Params: [like, like, like, like, status, status, brand, brand]
   */
  selectAllFiltered: `
    SELECT ${SELECT_COLUMNS}
    FROM All_Product_Name_MRP_Mapping
    WHERE (? IS NULL OR Sku_code LIKE ? OR SKU_Name_Fixed LIKE ? OR Brand LIKE ?)
      AND (? IS NULL OR ${STATUS_EXPR} = ?)
      AND (? IS NULL OR Brand = ?)
    ORDER BY Sku_code ASC
  `,

  /**
   * Matching COUNT for selectPaginated.
   * Params: [like, like, like, like, status, status, brand, brand]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM All_Product_Name_MRP_Mapping
    WHERE (? IS NULL OR Sku_code LIKE ? OR SKU_Name_Fixed LIKE ? OR Brand LIKE ?)
      AND (? IS NULL OR ${STATUS_EXPR} = ?)
      AND (? IS NULL OR Brand = ?)
  `,
}
