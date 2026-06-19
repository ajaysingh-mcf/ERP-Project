/**
 * Raw Materials (RM) Queries
 * Centralized queries for raw materials table and related tables (rm_mrm, rm_vrm)
 */

export const rawMaterials = {
  // ============ SELECT QUERIES ============

  /**
   * Get all raw materials grouped by manufacturer
   * Used in RawMaterialsPage manufacturer view
   */
  selectByManufacturer: `
    select rmm.rm_id, rmm.mfg_id, rmm.mfg_code, rmm.approved_vendor_id, rmm.approved_vendor_code,
      rmm.curr_rate, rmm.effective_from, rmm.uom, r.status,
      r.id, r.name, r.make, r.type, r.hsn_code, r.rm_code, r.inci_name
    from rm_mrm as rmm inner join rm as r on r.id = rmm.rm_id
  `,

  /**
   * Get all raw materials grouped by vendor
   * Used in RawMaterialsPage vendor view
   */
  selectByVendor: `
    select
      r.hsn_code, r.inci_name, r.make, r.name, r.rm_code, r.status, r.type,
      rmv.curr_rate, rmv.effective_from, rmv.effective_to,
      rmv.moq, rmv.uom, rmv.vendor_code, rmv.vendor_id
    from rm_vrm as rmv
    inner join rm as r on r.id = rmv.rm_id
  `,

  // ============ INSERT QUERIES ============

  /**
   * Insert a single raw material record
   * Parameters: [rm_code, name, make, type, uom, status, hsn_code, inci_name]
   */
  insert: `
    INSERT INTO rm (rm_code, name, make, type, uom, status, hsn_code, inci_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Insert a vendor rate record for a raw material
   * Parameters: [rm_id, vendor_id, vendor_code, curr_rate, moq, uom, effective_from, effective_to]
   */
  insertVendorRate: `
    INSERT INTO rm_vrm (rm_id, vendor_id, vendor_code, curr_rate, moq, uom, effective_from, effective_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Insert a manufacturer rate record for a raw material
   * Parameters: [rm_id, mfg_id, mfg_code, curr_rate, uom, approved_vendor_id, approved_vendor_code, effective_from]
   */
  insertMfgRate: `
    INSERT INTO rm_mrm (rm_id, mfg_id, mfg_code, curr_rate, uom, approved_vendor_id, approved_vendor_code, effective_from)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Check if an RM already exists by name + make + inci_name
   * Parameters: [name, make, inci_name]
   */
  checkDuplicate: `
    SELECT id FROM rm WHERE name = ? AND make = ? AND inci_name = ? 
  `,

  /**
   * Insert a minimal manufacturer approval row (no rate data yet)
   * Parameters: [rm_id, mfg_id, mfg_code]
   */
  insertMfgApproval: `
    INSERT INTO rm_mrm (rm_id, mfg_id, mfg_code, curr_rate, status)
    VALUES (?, ?, ?, 0, 'active')
  `,

  /**
   * Check if a vendor rate already exists for this rm + vendor combination.
   * Parameters: [rm_id, vendor_id]
   */
  checkVendorRate: `
    SELECT id, vendor_id, curr_rate, moq, uom, effective_from, effective_to, status
    FROM rm_vrm WHERE rm_id = ? AND vendor_id = ? LIMIT 1
  `,

  /**
   * Archive an old rm_vrm row into vrm_history before overwriting it.
   * Parameters: [rm_id, vendor_id, curr_rate, moq, uom, effective_from, effective_to, status]
   */
  archiveVendorRate: `
    INSERT INTO vrm_history (mtrl_type, mtrl_id, vendor_id, rate, moq, uom, effective_from, effective_to, status)
    VALUES ('rm', ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Update an existing rm_vrm row with new pricing (clears effective_to).
   * Parameters: [curr_rate, moq, uom, effective_from, id]
   */
  updateVendorRate: `
    UPDATE rm_vrm
    SET curr_rate = ?, moq = ?, uom = ?, effective_from = ?, effective_to = NULL, updated_on = NOW()
    WHERE id = ?
  `,
}
