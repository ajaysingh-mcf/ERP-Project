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
      from mfgs as mfg 
      Inner Join mfg_details as mfgd 
      on mfgd.mfg_id = mfg.id
    order by mfgd.mfg_id ASC`,
  // ============ INSERT QUERIES ============

  /**
   * Insert a single manufacturer record
   * Parameters: [code, name]
   */
  insert: `
    INSERT INTO mfgs (code, name) VALUES (?, ?)
  `,
}
