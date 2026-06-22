/**
 * Manufacturers Queries
 * Centralized queries for manufacturers table (mfgs)
 */

export const manufacturers = {
  // ============ Select Queries ===========
  // Select all the details of the manufacturer.
    selectAll: `select mfg.id, 
      mfgd.mfg_id , mfgd.status , mfgd.location,
      mfgd.gst_number, mfg.code , mfg.name 
      from master_mfgs as mfg 
      Inner Join mfg_details as mfgd 
      on mfgd.mfg_id = mfg.id
    order by mfgd.mfg_id ASC`,
  // ============ PAGINATED SELECT QUERIES ============

  /**
   * Paginated manufacturer list with optional search.
   * Params: [like, like, like, LIMIT, OFFSET]
   *   like — '%search%' or null
   */
  selectPaginated: `
    SELECT
      mfg.id, mfgd.mfg_id, mfgd.status, mfgd.location,
      mfgd.gst_number, mfg.code, mfg.name
    FROM master_mfgs AS mfg
    INNER JOIN mfg_details AS mfgd ON mfgd.mfg_id = mfg.id
    WHERE (? IS NULL OR mfg.code LIKE ? OR mfg.name LIKE ?)
    ORDER BY mfg.code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Matching COUNT for selectPaginated.
   * Params: [like, like, like]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM master_mfgs AS mfg
    INNER JOIN mfg_details AS mfgd ON mfgd.mfg_id = mfg.id
    WHERE (? IS NULL OR mfg.code LIKE ? OR mfg.name LIKE ?)
  `,

  // ============ INSERT QUERIES ============

  /**
   * Insert a single manufacturer record
   * Parameters: [code, name]
   */
  insert: `
    INSERT INTO master_mfgs (code, name) VALUES (?, ?)
  `,

  insertDetails: `
    INSERT INTO mfg_details (mfg_id, location, gst_number, status) VALUES (?, ?, ?, ?)
  `,
  /** */
  updateMfg: `
    UPDATE master_mfgs SET name = ? WHERE id = ?
  `,
  /** */
  updateMfgDetails: `
    UPDATE mfg_details SET location = ?, gst_number = ?, status = ? WHERE mfg_id = ?
  `,
}
