export const bom = {
    selectAll: `SELECT
                b.bom_code,bd.bom_id,b.sku_code,
                bd.mtrl_id,bd.mtrl_type,bd.uom,bd.amount,
                bd.mtrl_cost,bd.status AS material_status,b.status AS bom_status,
                bd.effective_from,bd.effective_till,bd.last_updated,
                b.created_by
            FROM bom_details AS bd
            INNER JOIN master_bom AS b
                ON b.id = bd.bom_id;`,
    // ============ PAGINATED SELECT QUERIES ============

    /**
     * Paginated BOM list with optional search, material-type, and BOM-status filters.
     * Params: [like, like, like, type, type, status, status, LIMIT, OFFSET]
     *   like   — '%search%' or null (bom_code / sku_code columns)
     *   type   — 'rm'|'pm' or null
     *   status — 'draft'|'active'|'inactive'|… or null
     */
    selectPaginated: `
      SELECT
        b.bom_code, bd.bom_id, b.sku_code,
        bd.mtrl_id, bd.mtrl_type, bd.uom, bd.amount,
        bd.mtrl_cost, bd.status AS material_status, b.status AS bom_status,
        bd.effective_from, bd.effective_till, bd.last_updated,
        b.created_by
      FROM bom_details AS bd
      INNER JOIN master_bom AS b ON b.id = bd.bom_id
      WHERE (? IS NULL OR b.bom_code LIKE ? OR b.sku_code LIKE ?)
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
      FROM bom_details AS bd
      INNER JOIN master_bom AS b ON b.id = bd.bom_id
      WHERE (? IS NULL OR b.bom_code LIKE ? OR b.sku_code LIKE ?)
        AND (? IS NULL OR bd.mtrl_type = ?)
        AND (? IS NULL OR b.status = ?)
    `,

    selectByIdBOMId: `Select * from master_bom where bom_code = ? and sku_code = ?`,
    insertBom: `
        INSERT INTO master_bom (bom_code, sku_code, mfg_id, status)
        VALUES (?, ?, ?, ?)
    `,

    insertBomDetail: `
        INSERT INTO bom_details (bom_id, mtrl_type, mtrl_id, amount, uom, mtrl_cost, effective_from, effective_till)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
}
