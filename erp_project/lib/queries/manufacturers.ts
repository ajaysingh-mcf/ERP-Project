/**
 * Manufacturers Queries
 * Centralized queries for manufacturers table (mfgs)
 */

export const manufacturers = {
  // ============ SELECT QUERIES ============

  /** Get all manufacturers with their details. */
  selectAll: `
    SELECT mfg.id, mfgd.mfg_id, mfgd.status, mfgd.location,
      mfgd.gst_number, mfg.code, mfg.name
    FROM master_mfgs AS mfg
    INNER JOIN details_mfg AS mfgd ON mfgd.mfg_id = mfg.id
    ORDER BY mfg.code ASC
  `,
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
    INNER JOIN details_mfg AS mfgd ON mfgd.mfg_id = mfg.id
    WHERE (? IS NULL OR mfg.code LIKE ? OR mfg.name LIKE ?)
    ORDER BY mfg.code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Fetch ALL matching manufacturers for export (no LIMIT/OFFSET).
   * Same WHERE clause as selectPaginated.
   * Params: [like, like, like]
   */
  selectAllFiltered: `
    SELECT
      mfg.id, mfgd.mfg_id, mfgd.status, mfgd.location,
      mfgd.gst_number, mfg.code, mfg.name
    FROM master_mfgs AS mfg
    INNER JOIN details_mfg AS mfgd ON mfgd.mfg_id = mfg.id
    WHERE (? IS NULL OR mfg.code LIKE ? OR mfg.name LIKE ?)
    ORDER BY mfg.code ASC
  `,

  /**
   * Matching COUNT for selectPaginated.
   * Params: [like, like, like]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM master_mfgs AS mfg
    INNER JOIN details_mfg AS mfgd ON mfgd.mfg_id = mfg.id
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

  /**
   * Insert manufacturer details record.
   * Parameters: [mfg_id, location, gst_number, status]
   * Must be called after insert with the insertId.
   */
  insertDetails: `
    INSERT INTO details_mfg (mfg_id, location, gst_number, status) VALUES (?, ?, ?, ?)
  `,

  // ============ UPDATE QUERIES ============

  /** Update manufacturer name. Parameters: [name, id] */
  updateMfg: `
    UPDATE master_mfgs SET name = ? WHERE id = ?
  `,

  /** Update manufacturer details. Parameters: [location, gst_number, status, mfg_id] */
  updateMfgDetails: `
    UPDATE details_mfg SET location = ?, gst_number = ?, status = ? WHERE mfg_id = ?
  `,
}
