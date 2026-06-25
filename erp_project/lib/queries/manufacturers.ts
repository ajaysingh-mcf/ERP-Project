/**
 * Manufacturers Queries
 * Centralized queries for manufacturers table (mfgs)
 */

export const manufacturers = {
  // ============ SELECT QUERIES ============

  /** Get all manufacturers with their details. */
  selectAll: `
    SELECT mfg.id, mfgd.mfg_id, mfgd.status, mfgd.location,
      mfgd.gst_number, mfgd.registered_name, mfgd.zone,
      mfgd.bank_name, mfgd.ifsc_number, mfgd.account_number,
      mfg.code, mfg.name
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
      mfgd.gst_number, mfgd.registered_name, mfgd.zone,
      mfgd.bank_name, mfgd.ifsc_number, mfgd.account_number,
      mfgd.email, mfg.code, mfg.name
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
      mfgd.gst_number, mfgd.registered_name, mfgd.zone,
      mfgd.bank_name, mfgd.ifsc_number, mfgd.account_number,
      mfgd.email, mfg.code, mfg.name
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
   * Parameters: [mfg_id, location, gst_number, status, registered_name, zone, bank_name, ifsc_number, account_number, email]
   * Must be called after insert with the insertId.
   */
  insertDetails: `
    INSERT INTO details_mfg (mfg_id, location, gst_number, status, registered_name, zone, bank_name, ifsc_number, account_number, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  // ============ UPDATE QUERIES ============

  /** Update manufacturer name. Parameters: [name, id] */
  updateMfg: `
    UPDATE master_mfgs SET name = ? WHERE id = ?
  `,

  /** Update manufacturer details. Parameters: [location, gst_number, status, registered_name, zone, bank_name, ifsc_number, account_number, email, mfg_id] */
  updateMfgDetails: `
    UPDATE details_mfg
    SET location = ?, gst_number = ?, status = ?,
        registered_name = ?, zone = ?, bank_name = ?,
        ifsc_number = ?, account_number = ?, email = ?
    WHERE mfg_id = ?
  `,

  // ── Approval-flow helpers ────────────────────────────────────────────────

  /** Fetch a single manufacturer by id (JOIN base + details).
   *  Parameters: [mfg_id]
   */
  selectById: `
    SELECT
      mfg.id, mfgd.mfg_id, mfgd.status, mfgd.location,
      mfgd.gst_number, mfgd.registered_name, mfgd.zone,
      mfgd.bank_name, mfgd.ifsc_number, mfgd.account_number,
      mfgd.email, mfg.code, mfg.name
    FROM master_mfgs AS mfg
    INNER JOIN details_mfg AS mfgd ON mfgd.mfg_id = mfg.id
    WHERE mfg.id = ? LIMIT 1
  `,

  /** Set status on the details_mfg row (e.g. 'in_review', 'draft', 'active').
   *  Parameters: [status, mfg_id]
   */
  setStatus: `UPDATE details_mfg SET status = ? WHERE mfg_id = ?`,

  /** Lightweight fetch of code + name — used when building readable approval diffs. Parameters: [id] */
  selectNameById: `SELECT code, name FROM master_mfgs WHERE id = ? LIMIT 1`,

  /**
   * Build the filter parameter array for selectPaginated, selectAllFiltered, and countAll.
   * Centralises the repeated-param pattern so callers never have to count repetitions.
   *
   * Usage:
   *   const fp = manufacturers.filterParams(search)
   *   paginate(manufacturers.selectPaginated, [...fp, limit, offset], manufacturers.countAll, fp, ...)
   */
  filterParams(search: string | null): unknown[] {
    const like = search ? `%${search}%` : null
    return [like, like, like]
  },
}
