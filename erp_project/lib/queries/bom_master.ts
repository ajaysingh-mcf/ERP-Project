export const bom = {
    selectAll: `SELECT
                b.bom_code,bd.bom_id,b.sku_code,
                bd.mtrl_id,bd.mtrl_type,bd.uom,bd.amount,
                bd.mtrl_cost,bd.status AS material_status,b.status AS bom_status,
                bd.effective_from,bd.effective_till,bd.last_updated,
                b.created_by
            FROM bom_details AS bd
            INNER JOIN bom AS b
                ON b.id = bd.bom_id;`,
    selectByIdBOMId: `Select * from bom where bom_code = ? and sku_code = ?`,
    insertBom: `
        INSERT INTO bom (bom_code, sku_code, mfg_id, status)
        VALUES (?, ?, ?, ?)
    `,

    insertBomDetail: `
        INSERT INTO bom_details (bom_id, mtrl_type, mtrl_id, amount, uom, mtrl_cost, effective_from, effective_till)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
}
