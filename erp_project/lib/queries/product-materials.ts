export const PMMaterials = {
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
}