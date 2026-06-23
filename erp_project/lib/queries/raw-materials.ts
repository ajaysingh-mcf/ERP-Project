/**
 * Raw Materials (RM) Queries
 * Centralized queries for raw materials table and related tables (rm_mrm, rm_vrm)
 */

export const rawMaterials = {
  // ============ SELECT QUERIES ============

  /** Get all raw materials (base data only, no rate joins) */
  selectAll: `
    SELECT id, rm_code, name, make, type, uom, status, hsn_code, inci_name
    FROM master_rm ORDER BY name
  `,

  /**
   * Get all raw materials grouped by manufacturer
   * Used in RawMaterialsPage manufacturer view
   */
  selectByManufacturer: `
    SELECT rmm.rm_id, rmm.mfg_id, rmm.mfg_code, rmm.approved_vendor_id, rmm.approved_vendor_code,
      rmm.curr_rate, rmm.effective_from, rmm.uom, r.status,
      r.id, r.name, r.make, r.type, r.hsn_code, r.rm_code, r.inci_name
    FROM rm_mrm_fixed AS rmm
    INNER JOIN master_rm AS r ON r.id = rmm.rm_id
  `,

  /**
   * Get all raw materials grouped by vendor
   * Used in RawMaterialsPage vendor view
   */
  selectByVendor: `
    SELECT
      r.hsn_code, r.inci_name, r.make, r.name, r.rm_code, r.status, r.type,
      rmv.curr_rate, rmv.effective_from, rmv.effective_to,
      rmv.moq, rmv.uom, rmv.vendor_code, rmv.vendor_id
    FROM rm_vrm_dynamic AS rmv
    INNER JOIN master_rm AS r ON r.id = rmv.rm_id
  `,

  // ============ PAGINATED BASE TABLE QUERIES (material-master page) ============

  /**
   * Paginated base RM list with optional search + status filter.
   * Params: [like, like, like, like, status, status, LIMIT, OFFSET]
   *   like   — '%search%' or null (rm_code / name / make columns)
   *   status — 'active'|'discontinued' or null
   */
  selectPaginated: `
    SELECT id, rm_code, name, make, type, uom, status, hsn_code, inci_name
    FROM master_rm
    WHERE (? IS NULL OR rm_code LIKE ? OR name LIKE ? OR make LIKE ?)
      AND (? IS NULL OR status = ?)
    ORDER BY name ASC
    LIMIT ? OFFSET ?
  `,

  /** Matching COUNT for selectPaginated. Params: [like, like, like, like, status, status] */
  countAll: `
    SELECT COUNT(*) AS total FROM master_rm
    WHERE (? IS NULL OR rm_code LIKE ? OR name LIKE ? OR make LIKE ?)
      AND (? IS NULL OR status = ?)
  `,

  /**
   * Update RM base record fields (rm_code is auto-generated, never changed).
   * Params: [name, make, type, uom, status, hsn_code, inci_name, id]
   */
  update: `
    UPDATE master_rm
    SET name = ?, make = ?, type = ?, uom = ?, status = ?, hsn_code = ?, inci_name = ?
    WHERE id = ?
  `,

  // ============ PAGINATED SELECT QUERIES (raw-materials rate page) ============

  /**
   * Paginated RM × vendor rates with optional search + status filter.
   * Params: [like, like, like, status, status, LIMIT, OFFSET]
   *   like   — '%search%' or null (rm_code / name columns)
   *   status — 'active'|'discontinued' or null
   */
  selectVendorPaginated: `
    SELECT
      r.hsn_code, r.inci_name, r.make, r.name, r.rm_code, r.status, r.type,
      rmv.curr_rate, rmv.effective_from, rmv.effective_to,
      rmv.moq, rmv.uom, rmv.vendor_code, rmv.vendor_id
    FROM rm_vrm_dynamic AS rmv
    INNER JOIN master_rm AS r ON r.id = rmv.rm_id
    WHERE (? IS NULL OR r.rm_code LIKE ? OR r.name LIKE ?)
      AND (? IS NULL OR r.status = ?)
    ORDER BY r.rm_code ASC
    LIMIT ? OFFSET ?
  `,

  /** Matching COUNT for selectVendorPaginated. Params: [like, like, like, status, status] */
  countVendor: `
    SELECT COUNT(*) AS total
    FROM rm_vrm_dynamic AS rmv
    INNER JOIN master_rm AS r ON r.id = rmv.rm_id
    WHERE (? IS NULL OR r.rm_code LIKE ? OR r.name LIKE ?)
      AND (? IS NULL OR r.status = ?)
  `,

  /**
   * Paginated RM × manufacturer rates with optional search + status filter.
   * Params: [like, like, like, status, status, LIMIT, OFFSET]
   */
  selectMfgPaginated: `
    SELECT
      rmm.rm_id, rmm.mfg_id, rmm.mfg_code, rmm.approved_vendor_id, rmm.approved_vendor_code,
      rmm.curr_rate, rmm.effective_from, rmm.uom, r.status,
      r.id, r.name, r.make, r.type, r.hsn_code, r.rm_code, r.inci_name
    FROM rm_mrm_fixed AS rmm
    INNER JOIN master_rm AS r ON r.id = rmm.rm_id
    WHERE (? IS NULL OR r.rm_code LIKE ? OR r.name LIKE ?)
      AND (? IS NULL OR r.status = ?)
    ORDER BY r.rm_code ASC
    LIMIT ? OFFSET ?
  `,

  /** Matching COUNT for selectMfgPaginated. Params: [like, like, like, status, status] */
  countMfg: `
    SELECT COUNT(*) AS total
    FROM rm_mrm_fixed AS rmm
    INNER JOIN master_rm AS r ON r.id = rmm.rm_id
    WHERE (? IS NULL OR r.rm_code LIKE ? OR r.name LIKE ?)
      AND (? IS NULL OR r.status = ?)
  `,

  // ============ INSERT QUERIES ============

  /**
   * Insert a single raw material record
   * Parameters: [rm_code, name, make, type, uom, status, hsn_code, inci_name]
   */
  insert: `
    INSERT INTO master_rm (rm_code, name, make, type, uom, status, hsn_code, inci_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Insert a vendor rate record for a raw material
   * Parameters: [rm_id, vendor_id, vendor_code, curr_rate, moq, uom, effective_from, effective_to]
   */
  insertVendorRate: `
    INSERT INTO rm_vrm_dynamic (rm_id, vendor_id, vendor_code, curr_rate, moq, uom, effective_from, effective_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Insert a manufacturer rate record for a raw material
   * Parameters: [rm_id, mfg_id, mfg_code, curr_rate, uom, approved_vendor_id, approved_vendor_code, effective_from]
   */
  insertMfgRate: `
    INSERT INTO rm_mrm_fixed (rm_id, mfg_id, mfg_code, curr_rate, uom, approved_vendor_id, approved_vendor_code, effective_from)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Check if an RM already exists by name + make + inci_name
   * Parameters: [name, make, inci_name]
   */
  checkDuplicate: `
    SELECT id FROM master_rm WHERE name = ? AND make = ? AND inci_name = ? 
  `,

  /**
   * Insert a minimal manufacturer approval row (no rate data yet)
   * Parameters: [rm_id, mfg_id, mfg_code]
   */
  insertMfgApproval: `
    INSERT INTO rm_mrm_fixed (rm_id, mfg_id, mfg_code, curr_rate, status)
    VALUES (?, ?, ?, 0, 'active')
  `,

  /**
   * Check if a vendor rate already exists for this rm + vendor combination.
   * Parameters: [rm_id, vendor_id]
   */
  checkVendorRate: `
    SELECT id, vendor_id, curr_rate, moq, uom, effective_from, effective_to, status
    FROM rm_vrm_dynamic WHERE rm_id = ? AND vendor_id = ? LIMIT 1
  `,

  /**
   * Archive an old rm_vrm row into vrm_history before overwriting it.
   * Parameters: [rm_id, vendor_id, curr_rate, moq, uom, effective_from, effective_to, status]
   */
  archiveVendorRate: `
    INSERT INTO history_vrm (mtrl_type, mtrl_id, vendor_id, rate, moq, uom, effective_from, effective_to, status)
    VALUES ('rm', ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /**
   * Update an existing rm_vrm row with new pricing (clears effective_to).
   * Parameters: [curr_rate, moq, uom, effective_from, id]
   */
  updateVendorRate: `
    UPDATE rm_vrm_dynamic
    SET curr_rate = ?, moq = ?, uom = ?, effective_from = ?, effective_to = NULL, updated_on = NOW()
    WHERE id = ?
  `,

  /** Archive old RM vendor rate to history_vrm before overwriting.
   *  Parameters: [mtrl_id, vendor_id, rate, effective_from, effective_to, status]
   */
  archiveToHistoryVrm: `
    INSERT INTO history_vrm (mtrl_type, mtrl_id, vendor_id, rate, effective_from, effective_to, status)
    VALUES ('rm', ?, ?, ?, ?, ?, ?)
  `,

  /** Check if a mfg rate already exists for this rm + mfg combination.
   *  Parameters: [rm_id, mfg_id]
   */
  checkMfgRate: `
    SELECT id, mfg_id, curr_rate, uom, approved_vendor_id, effective_from, status
    FROM rm_mrm_fixed WHERE rm_id = ? AND mfg_id = ? LIMIT 1
  `,

  /** Update an existing rm_mrm row with new rate data.
   *  Parameters: [curr_rate, uom, effective_from, id]
   */
  updateMfgRate: `
    UPDATE rm_mrm_fixed SET curr_rate = ?, uom = ?, effective_from = ?, updated_on = NOW() WHERE id = ?
  `,

  /** Archive old RM mfg rate to history_mrm before overwriting.
   *  Parameters: [mfg_id, mtrl_id, vendor_id, rate, effective_from, effective_to, status]
   */
  archiveToHistoryMrm: `
    INSERT INTO history_mrm (mfg_id, mtrl_type, mtrl_id, vendor_id, rate, effective_from, effective_to, status)
    VALUES (?, 'rm', ?, ?, ?, ?, ?, ?)
  `,

  /** Find the first vendor_id linked to an RM in the vendor rate master. Parameters: [rm_id] */
  getVendorId: `
    SELECT vendor_id FROM rm_vrm_dynamic WHERE rm_id = ? AND vendor_id IS NOT NULL LIMIT 1
  `,
}
