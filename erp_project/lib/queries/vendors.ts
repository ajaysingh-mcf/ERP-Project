/**
 * Vendors Queries
 * Centralized queries for vendors table and vendor_details table
 *
 * Note: Vendors span two tables linked only by ID (no DB foreign key):
 *   vendors(id, code, name, type)
 *   vendor_details(vendor_id → vendors.id, location, gst_number, status)
 */

export const vendors = {
  // ============ SELECT QUERIES ============

  /**
   * Get all vendors with their details
   * Used in VendorsPage
   */
  selectAll: `
    SELECT
      vd.vendor_id,
      vd.gst_number,
      vd.location,
      vd.status,
      v.code,
      v.name,
      v.type
    FROM vendor_details vd
    JOIN vendors v ON vd.vendor_id = v.id
  `,

  // ============ INSERT QUERIES ============

  /**
   * Insert vendor base record
   * Parameters: [code, name, type]
   * Returns insertId that should be used for vendor_details
   */
  insertVendor: `
    INSERT INTO vendors (code, name, type) VALUES (?, ?, ?)
  `,

  /**
   * Insert vendor details record
   * Parameters: [vendor_id, location, gst_number, status]
   * Must be called after insertVendor with the insertId
   */
  insertVendorDetails: `
    INSERT INTO vendor_details (vendor_id, location, gst_number, status) VALUES (?, ?, ?, ?)
  `,
}
