export const PMMaterials = {
  /** Get all packing materials (base data only, no rate joins) */
  selectAll: `
    SELECT id, pm_code, name, type, uom, status, hsn_code
    FROM pm ORDER BY name
  `,

   /** Get all Packing material along with vendor details and prices. */
  selectAllByVendor: `
    SELECT
      p.pm_code, p.name, p.type,
      p.hsn_code, pmv.pm_id,
      pmv.vendor_id, pmv.vendor_code,
      pmv.curr_rate, pmv.moq,
      pmv.uom, pmv.status,
      pmv.effective_from, pmv.effective_to
    FROM pm_vrm AS pmv
    INNER JOIN pm AS p ON pmv.pm_id = p.id
  `,
  /** Get all Packing material along with manufacturer details and prices. */
  selectAllByManufacturer: `
    SELECT
      p.pm_code, p.name, p.type,
      p.hsn_code, p.uom, pmm.pm_id,
      pmm.mfg_id, pmm.mfg_code, pmm.curr_rate,
      pmm.uom, pmm.status, pmm.effective_from
    FROM pm_mrm AS pmm
    INNER JOIN pm AS p ON pmm.pm_id = p.id
  `,
  insert: `
    INSERT INTO pm (pm_code, name, type, hsn_code, uom, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `,

  /** Parameters: [pm_id, vendor_id, vendor_code, curr_rate, moq, uom, status, effective_from, effective_to] */
  insertVendorRate: `
    INSERT INTO pm_vrm (pm_id, vendor_id, vendor_code, curr_rate, moq, uom, status, effective_from, effective_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /** Parameters: [pm_id, mfg_id, mfg_code, curr_rate, uom, status, effective_from] */
  insertMfgRate: `
    INSERT INTO pm_mrm (pm_id, mfg_id, mfg_code, curr_rate, uom, status, effective_from)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,

  /** Check if a PM already exists by name + type. Parameters: [name, type] */
  checkDuplicate: `
    SELECT id, pm_code FROM pm WHERE name = ? AND type = ? LIMIT 1
  `,

  /** Check if a vendor rate exists for this pm + vendor. Parameters: [pm_id, vendor_id] */
  checkVendorRate: `
    SELECT id, vendor_id, curr_rate, moq, uom, status, effective_from, effective_to
    FROM pm_vrm WHERE pm_id = ? AND vendor_id = ? LIMIT 1
  `,

  /** Archive an old pm_vrm row to vrm_history. Parameters: [pm_id, vendor_id, curr_rate, moq, uom, effective_from, effective_to, status] */
  archiveVendorRate: `
    INSERT INTO vrm_history (mtrl_type, mtrl_id, vendor_id, rate, moq, uom, effective_from, effective_to, status)
    VALUES ('pm', ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /** Update an existing pm_vrm row. Parameters: [curr_rate, moq, uom, status, effective_from, id] */
  updateVendorRate: `
    UPDATE pm_vrm SET curr_rate = ?, moq = ?, uom = ?, status = ?, effective_from = ?, effective_to = NULL, updated_on = NOW()
    WHERE id = ?
  `,

  /** Check if a manufacturer rate exists for this pm + mfg. Parameters: [pm_id, mfg_id] */
  checkMfgRate: `
    SELECT id FROM pm_mrm WHERE pm_id = ? AND mfg_id = ? LIMIT 1
  `,

  /** Update an existing pm_mrm approval row in place. Parameters: [curr_rate, uom, effective_from, id] */
  updateMfgRate: `
    UPDATE pm_mrm SET curr_rate = ?, uom = ?, effective_from = ?, updated_on = NOW() WHERE id = ?
  `,

  /** Insert a minimal pm_mrm approval row (curr_rate = 0, rates filled later). Parameters: [pm_id, mfg_id, mfg_code, effective_from] */
  insertMfgApproval: `
    INSERT INTO pm_mrm (pm_id, mfg_id, mfg_code, curr_rate, uom, status, effective_from)
    VALUES (?, ?, ?, 0, NULL, 'active', ?)
  `,
}