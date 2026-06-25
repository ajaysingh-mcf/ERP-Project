/**
 * S3 File Attachment Queries
 *
 * All SQL related to storing and retrieving S3 object keys against
 * various entities in the ERP. Keys are stored as TEXT NULL columns;
 * signed URLs are generated on demand via lib/s3.ts.
 */

export const s3FilesSql = {
  // ── Purchase Orders ──────────────────────────────────────────────────────

  /** Set or clear the attachment on a PO. Parameters: [attachment_key | null, po_id] */
  updatePoAttachment: `
    UPDATE purchase_orders SET attachment_key = ? WHERE id = ?
  `,

  /** Fetch the current attachment key for a PO. Parameters: [po_id] */
  getPoAttachment: `
    SELECT attachment_key FROM purchase_orders WHERE id = ? LIMIT 1
  `,
}
