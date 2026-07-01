/**
 * Vendors Queries
 * Centralized queries for vendors table and vendor_details table
 *
 * Note: Vendors span two tables linked only by ID (no DB foreign key):
 *   vendors(id, code, name, type)
 *   details_vendor(vendor_id → vendors.id, location, status, zone, registered_name)
 */

export const vendors = {
  // ============ SELECT QUERIES ============

  /**
   * Get all vendors with their details
   * Used in VendorsPage
   */
  selectAll: `
    SELECT
      vd.vendor_id, vd.location, vd.status,
      vd.zone, vd.registered_name, v.code, v.name, v.type
    FROM details_vendor vd
    JOIN master_vendors v ON vd.vendor_id = v.id
  `,

  // ============ PAGINATED SELECT QUERIES ============

  /**
   * Paginated vendor list with optional search + type filter.
   *
   * SQL pattern: (? IS NULL OR col LIKE ?) — passing null for the first
   * param short-circuits the condition, returning all rows.
   *
   * Params: [like, like, like, type, type, LIMIT, OFFSET]
   *   like — '%search%' or null (used three times: null-check + code LIKE + name LIKE)
   *   type — 'rm'|'pm'|'both' or null
   */
  selectPaginated: `
    SELECT
      vd.vendor_id, vd.location, vd.status,
      vd.zone, vd.registered_name, v.code, v.name, v.type
    FROM details_vendor vd
    JOIN master_vendors v ON vd.vendor_id = v.id
    WHERE (? IS NULL OR v.code LIKE ? OR v.name LIKE ?)
      AND (? IS NULL OR v.type = ?)
    ORDER BY v.code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Fetch ALL matching vendors for export (no LIMIT/OFFSET).
   * Same WHERE clause as selectPaginated.
   * Params: [like, like, like, type, type]
   */
  selectAllFiltered: `
    SELECT
      vd.vendor_id, vd.location, vd.status,
      vd.zone, vd.registered_name, v.code, v.name, v.type
    FROM details_vendor vd
    JOIN master_vendors v ON vd.vendor_id = v.id
    WHERE (? IS NULL OR v.code LIKE ? OR v.name LIKE ?)
      AND (? IS NULL OR v.type = ?)
    ORDER BY v.code ASC
  `,

  /**
   * Matching COUNT for selectPaginated (same WHERE, no LIMIT/OFFSET).
   * Params: [like, like, like, type, type]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM details_vendor vd
    JOIN master_vendors v ON vd.vendor_id = v.id
    WHERE (? IS NULL OR v.code LIKE ? OR v.name LIKE ?)
      AND (? IS NULL OR v.type = ?)
  `,

  // ============ INSERT QUERIES ============

  /**
   * Insert vendor base record
   * Parameters: [code, name, type]
   * Returns insertId that should be used for details_vendor
   */
  insertVendor: `
    INSERT INTO master_vendors (code, name, type) VALUES (?, ?, ?)
  `,

  /** Total vendor count — used to seed the next auto-generated code serial. */
  countTotal: `SELECT COUNT(*) AS total FROM master_vendors`,

  /**
   * Insert vendor details record
   * Parameters: [vendor_id, location, status, zone, registered_name]
   * Must be called after insertVendor with the insertId
   */
  insertVendorDetails: `
    INSERT INTO details_vendor (vendor_id, location, status, zone, registered_name) VALUES (?, ?, ?, ?, ?)
  `,

  // ============ UPDATE QUERIES ============

  /** Update vendor name and type. Parameters: [name, type, id] */
  updateVendor: `
    UPDATE master_vendors SET name = ?, type = ? WHERE id = ?
  `,

  /** Update vendor details record. Parameters: [location, status, zone, registered_name, vendor_id] */
  updateVendorDetails: `
    UPDATE details_vendor SET location = ?, status = ?, zone = ?, registered_name = ? WHERE vendor_id = ?
  `,

  // ── Approval-flow helpers ────────────────────────────────────────────────

  /** Fetch a single vendor by vendor_id (JOIN base + details).
   *  Parameters: [vendor_id]
   */
  selectById: `
    SELECT
      vd.vendor_id, vd.location, vd.status,
      vd.zone, vd.registered_name, v.code, v.name, v.type
    FROM details_vendor vd
    JOIN master_vendors v ON vd.vendor_id = v.id
    WHERE vd.vendor_id = ? LIMIT 1
  `,

  /** Set status on the details_vendor row (e.g. 'in_review', 'draft', 'active').
   *  Parameters: [status, vendor_id]
   */
  setStatus: `UPDATE details_vendor SET status = ? WHERE vendor_id = ?`,

  /**
   * Build the filter parameter array for selectPaginated, selectAllFiltered, and countAll.
   * Centralises the repeated-param pattern so callers never have to count repetitions.
   *
   * Usage:
   *   const fp = vendors.filterParams(search, type)
   *   paginate(vendors.selectPaginated, [...fp, limit, offset], vendors.countAll, fp, ...)
   */
  filterParams(search: string | null, type: string | null): unknown[] {
    const like = search ? `%${search}%` : null
    return [like, like, like, type, type]
  },

}
