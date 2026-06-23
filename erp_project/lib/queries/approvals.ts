/**
 * Approval Workflow Queries
 *
 * Raw-SQL strings consumed by the approvals API routes via
 * query() / execute() / pool.getConnection() from lib/db.ts.
 *
 * The `approvals` table tracks who submitted an edit and its current state.
 * The `approval_items` table stores a field-level diff (old_value / new_value)
 * for each changed field within one approval.
 */

export const approvalsSql = {
  // ── Write ───────────────────────────────────────────────────────────────

  /** Create a parent approval record. Caller reads insertId for the new ID.
   *  Parameters: [raised_by, module, entity_id]
   */
  insertApproval: `
    INSERT INTO approvals (raised_by, module, entity_id, approval_type, status)
    VALUES (?, ?, ?, 'edit', 'pending')
  `,

  /** Insert one approval_items row per changed field.
   *  Parameters: [approval_id, field_name, old_value, new_value]
   */
  insertApprovalItem: `
    INSERT INTO approval_items (approval_id, field_name, old_value, new_value)
    VALUES (?, ?, ?, ?)
  `,

  /** Mark an approval as approved. Parameters: [approved_by, id] */
  markApproved: `
    UPDATE approvals
    SET status = 'approved', approved_by = ?, approved_on = NOW()
    WHERE id = ?
  `,

  /** Mark an approval as rejected with mandatory remarks. Parameters: [approved_by, remarks, id] */
  markRejected: `
    UPDATE approvals
    SET status = 'rejected', approved_by = ?, approved_on = NOW(), remarks = ?
    WHERE id = ?
  `,

  // ── Read ────────────────────────────────────────────────────────────────

  /** All pending approvals with submitter name — drives the Approvals page.
   *  No parameters.
   */
  listPending: `
    SELECT
      a.id,
      a.module,
      a.entity_id,
      a.raised_on,
      u.name AS raised_by_name
    FROM approvals a
    JOIN users u ON u.id = a.raised_by
    WHERE a.status = 'pending'
    ORDER BY a.raised_on DESC
  `,

  /** Field-level diff rows for one approval. Parameters: [approval_id] */
  getItems: `
    SELECT field_name, old_value, new_value
    FROM approval_items
    WHERE approval_id = ?
  `,

  /** Single approval header used by the approve/reject handler. Parameters: [id] */
  getById: `
    SELECT id, module, entity_id, raised_by, status
    FROM approvals
    WHERE id = ?
  `,

  /** Prevent double-submit: check if an entity already has a pending approval.
   *  Parameters: [module, entity_id]
   *  Returns one row if pending, zero rows if clear.
   */
  hasPending: `
    SELECT id FROM approvals
    WHERE module = ? AND entity_id = ? AND status = 'pending'
    LIMIT 1
  `,

  /** Fetch the most recent rejection for a given entity, with submitter + rejector names.
   *  Used by edit dialogs to show why a draft was rejected and who owns re-editing it.
   *  Parameters: [module, entity_id]
   */
  selectLatestRejection: `
    SELECT
      a.raised_by,
      a.remarks,
      a.approved_on AS rejected_on,
      u_raised.name   AS raised_by_name,
      u_approved.name AS rejected_by_name
    FROM approvals a
    LEFT JOIN users u_raised   ON u_raised.id   = a.raised_by
    LEFT JOIN users u_approved ON u_approved.id  = a.approved_by
    WHERE a.module = ? AND a.entity_id = ? AND a.status = 'rejected'
    ORDER BY a.approved_on DESC
    LIMIT 1
  `,
}
