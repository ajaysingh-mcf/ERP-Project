/**
 * BOM Queries
 * Centralized queries for master_bom, details_bom, and history_bom.
 *
 * Real schema (verify against prisma/schema.prisma before adding queries —
 * master_bom has NO sku_code/mfg_id columns, only sku_id):
 *   master_bom(id, bom_code, sku_id, status, created_by, created_at, updated_by, updated_at)
 *   details_bom(id, bom_id → master_bom.id, mtrl_type, mtrl_id, amount, uom,
 *               effective_from, effective_till, status, updated_by, last_updated)
 *   history_bom — same shape as details_bom plus mtrl_cost; snapshot target for
 *               "update existing BOM in place" (see lib/approvals/module-handlers.ts)
 *
 * IMPORTANT: master_bom_status's "in_review" enum member is @map("in review")
 * in prisma/schema.prisma — the ACTUAL value stored in the DB column has a
 * space, unlike every other module's status column (STATUS.IN_REVIEW =
 * "in_review", no space). Never write STATUS.IN_REVIEW to master_bom.status —
 * use BOM_STATUS_IN_REVIEW below, or the write silently fails/rolls back.
 */

export const BOM_STATUS_IN_REVIEW = "in review"

export const bom = {
  // ============ SELECT QUERIES ============

  /**
   * Get all BOM records with detail lines joined.
   * Returns full columns from both bom and bom_details.
   */
  selectAll: `
    SELECT
      b.bom_code, bd.bom_id, s.sku_code,
      bd.mtrl_id, bd.mtrl_type, bd.uom, bd.amount,
      NULL AS mtrl_cost, bd.status AS material_status, b.status AS bom_status,
      bd.effective_from, bd.effective_till, bd.last_updated,
      b.created_by
    FROM details_bom AS bd
    INNER JOIN master_bom AS b ON b.id = bd.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    ORDER BY b.bom_code ASC
  `,

  // ============ PAGINATED SELECT QUERIES ============

  /**
   * Paginated BOM list with optional search, material-type, and status filters.
   * Params: [like, like, like, type, type, status, status, LIMIT, OFFSET]
   *   like   — '%search%' or null (bom_code / sku_code columns)
   *   type   — 'rm'|'pm' or null
   *   status — 'draft'|'active'|'inactive' or null
   */
  selectPaginated: `
    SELECT
      b.bom_code, bd.bom_id, s.sku_code,
      bd.mtrl_id, bd.mtrl_type, bd.uom, bd.amount,
      NULL AS mtrl_cost, bd.status AS material_status, b.status AS bom_status,
      bd.effective_from, bd.effective_till, bd.last_updated,
      b.created_by
    FROM details_bom AS bd
    INNER JOIN master_bom AS b ON b.id = bd.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
      AND (? IS NULL OR bd.mtrl_type = ?)
      AND (? IS NULL OR b.status = ?)
    ORDER BY b.bom_code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Fetch ALL matching BOM rows for export (no LIMIT/OFFSET).
   * Same WHERE clause as selectPaginated.
   * Params: [like, like, like, type, type, status, status]
   */
  selectAllFiltered: `
    SELECT
      b.bom_code, bd.bom_id, s.sku_code,
      bd.mtrl_id, bd.mtrl_type, bd.uom, bd.amount,
      NULL AS mtrl_cost, bd.status AS material_status, b.status AS bom_status,
      bd.effective_from, bd.effective_till, bd.last_updated,
      b.created_by
    FROM details_bom AS bd
    INNER JOIN master_bom AS b ON b.id = bd.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
      AND (? IS NULL OR bd.mtrl_type = ?)
      AND (? IS NULL OR b.status = ?)
    ORDER BY b.bom_code ASC
  `,

  /**
   * Matching COUNT for selectPaginated.
   * Params: [like, like, like, type, type, status, status]
   */
  countAll: `
    SELECT COUNT(*) AS total
    FROM details_bom AS bd
    INNER JOIN master_bom AS b ON b.id = bd.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
      AND (? IS NULL OR bd.mtrl_type = ?)
      AND (? IS NULL OR b.status = ?)
  `,

  /**
   * Does this SKU already have an ACTIVE BOM? Params: [sku_id]
   */
  selectActiveBomBySkuId: `
    SELECT b.id AS bom_id, b.bom_code, b.status
    FROM master_bom AS b
    WHERE b.sku_id = ? AND b.status = 'active'
    LIMIT 1
  `,

  /**
   * All BOMs (any status) for a SKU, newest first — used to suggest the next
   * version's bom_code. Params: [sku_id]
   */
  selectBomsBySkuId: `
    SELECT id AS bom_id, bom_code, status, created_at
    FROM master_bom
    WHERE sku_id = ?
    ORDER BY created_at DESC
  `,

  /**
   * Every active SKU whose active BOM references this material — portfolio-wide,
   * used by the RM/PM vendor-rate edit dialogs' cost-impact alert.
   * Params: [mtrl_type, mtrl_id]
   */
  selectActiveSkusUsingMaterial: `
    SELECT DISTINCT s.sku_code, s.name
    FROM details_bom bd
    INNER JOIN master_bom b ON b.id = bd.bom_id AND b.status = 'active'
    INNER JOIN master_skus s ON s.id = b.sku_id
    WHERE bd.mtrl_type = ? AND bd.mtrl_id = ? AND bd.status = 'active'
    ORDER BY s.sku_code ASC
  `,

  /**
   * Same as selectActiveSkusUsingMaterial, but narrowed to SKUs one specific
   * manufacturer actually produces (via master_bom_mfg) — used by the RM/PM
   * manufacturer-rate edit dialogs' cost-impact alert.
   * Params: [mfg_id, mtrl_type, mtrl_id]
   */
  selectActiveSkusUsingMaterialForMfg: `
    SELECT DISTINCT s.sku_code, s.name
    FROM details_bom bd
    INNER JOIN master_bom b ON b.id = bd.bom_id AND b.status = 'active'
    INNER JOIN master_bom_mfg mbm ON mbm.bom_id = b.id AND mbm.status = 'active' AND mbm.mfg_id = ?
    INNER JOIN master_skus s ON s.id = b.sku_id
    WHERE bd.mtrl_type = ? AND bd.mtrl_id = ? AND bd.status = 'active'
    ORDER BY s.sku_code ASC
  `,

  /**
   * Bare header lookup for existence/status checks before mutating. Params: [id]
   */
  selectBomHeaderRawById: `
    SELECT id, bom_code, sku_id, status, created_by
    FROM master_bom
    WHERE id = ?
  `,

  /**
   * All current detail lines for a BOM, raw columns (no name/code joins) —
   * used to snapshot into history_bom and to diff against a proposed line set.
   * Params: [bom_id]
   */
  selectDetailLinesRawByBomId: `
    SELECT id, bom_id, mtrl_type, mtrl_id, amount, uom, effective_from, effective_till, status, updated_by
    FROM details_bom
    WHERE bom_id = ?
    ORDER BY mtrl_type ASC, mtrl_id ASC
  `,

  /**
   * Paginated BOM listing, ONE ROW PER BOM HEADER (not per material line).
   * created_at is when the BOM header itself was created; effective_from is
   * the earliest, effective_till the latest, among the BOM's material lines —
   * these can legitimately differ (e.g. a BOM created today with lines that
   * don't take effect until next month), so both are surfaced separately.
   * Params: [like, like, like, status, status, LIMIT, OFFSET]
   */
  selectPaginatedGrouped: `
    SELECT
      b.id AS bom_id, b.bom_code, s.sku_code, s.name AS sku_name,
      b.created_at,
      MIN(bd.effective_from) AS effective_from,
      MAX(bd.effective_till) AS effective_till,
      b.status AS status
    FROM master_bom AS b
    LEFT JOIN details_bom AS bd ON bd.bom_id = b.id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
      AND (? IS NULL OR b.status = ?)
    GROUP BY b.id, b.bom_code, s.sku_code, s.name, b.created_at, b.status
    ORDER BY b.bom_code ASC
    LIMIT ? OFFSET ?
  `,

  /**
   * Fetch ALL matching BOM headers, grouped (no LIMIT/OFFSET) — feeds the
   * fuzzy-search ranking path (lib/fuzzy-search.ts) when a search term is
   * present. Same shape/WHERE as selectPaginatedGrouped.
   * Params: [like, like, like, status, status]
   */
  selectAllFilteredGrouped: `
    SELECT
      b.id AS bom_id, b.bom_code, s.sku_code, s.name AS sku_name,
      b.created_at,
      MIN(bd.effective_from) AS effective_from,
      MAX(bd.effective_till) AS effective_till,
      b.status AS status
    FROM master_bom AS b
    LEFT JOIN details_bom AS bd ON bd.bom_id = b.id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
      AND (? IS NULL OR b.status = ?)
    GROUP BY b.id, b.bom_code, s.sku_code, s.name, b.created_at, b.status
    ORDER BY b.bom_code ASC
  `,

  /**
   * Matching COUNT for selectPaginatedGrouped (one BOM header = one row).
   * Params: [like, like, like, status, status]
   */
  countGrouped: `
    SELECT COUNT(*) AS total
    FROM master_bom AS b
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
      AND (? IS NULL OR b.status = ?)
  `,

  /**
   * BOM header for the detail side-panel. Params: [bom_id]
   */
  selectHeaderById: `
    SELECT b.id AS bom_id, b.bom_code, b.sku_id, s.sku_code, b.status, b.created_at
    FROM master_bom AS b
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE b.id = ?
  `,

  /**
   * All material lines for a BOM, for the detail side-panel. Params: [bom_id]
   * Resolves the material's name/code from master_rm or master_pm depending
   * on mtrl_type, since details_bom only stores a bare mtrl_id.
   */
  selectDetailLinesByBomId: `
    SELECT
      b.bom_code, bd.bom_id, s.sku_code,
      bd.mtrl_id, bd.mtrl_type, bd.uom, bd.amount,
      NULL AS mtrl_cost, bd.status AS material_status, b.status AS bom_status,
      bd.effective_from, bd.effective_till, bd.last_updated,
      b.created_by,
      COALESCE(rm.name, pm.name) AS mtrl_name,
      COALESCE(rm.rm_code, pm.pm_code) AS mtrl_code,
      COALESCE(rm.status, pm.status) AS mtrl_master_status
    FROM details_bom AS bd
    INNER JOIN master_bom AS b ON b.id = bd.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    LEFT JOIN master_rm AS rm ON rm.id = bd.mtrl_id AND bd.mtrl_type = 'rm'
    LEFT JOIN master_pm AS pm ON pm.id = bd.mtrl_id AND bd.mtrl_type = 'pm'
    WHERE bd.bom_id = ?
    ORDER BY bd.mtrl_type ASC, bd.mtrl_id ASC
  `,

  // ============ WRITE QUERIES ============

  /**
   * Insert a new BOM header. Parameters: [bom_code, sku_id, created_by, status]
   * Returns insertId to link detail lines to.
   */
  insertBomHeader: `
    INSERT INTO master_bom (bom_code, sku_id, created_by, status, created_at)
    VALUES (?, ?, ?, ?, NOW())
  `,

  /**
   * Insert a single BOM detail line. Only ever called at approval time (see
   * lib/approvals/module-handlers.ts bomHandler) — never at submission time.
   * Parameters: [bom_id, mtrl_type, mtrl_id, amount, uom, effective_from, effective_till, status, updated_by]
   */
  insertDetailLine: `
    INSERT INTO details_bom
      (bom_id, mtrl_type, mtrl_id, amount, uom, effective_from, effective_till, status, updated_by, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `,

  /**
   * Archive one detail line snapshot into history_bom, before it's overwritten
   * by an "update existing BOM in place" approval.
   * Parameters: [bom_id, mtrl_type, mtrl_id, amount, uom, mtrl_cost, effective_from, effective_till, status, updated_by]
   */
  archiveDetailLineToHistory: `
    INSERT INTO history_bom
      (bom_id, mtrl_type, mtrl_id, amount, uom, mtrl_cost, effective_from, effective_till, status, updated_by, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `,

  /**
   * Delete all current detail lines for a BOM before re-inserting the new
   * set — used by the "update existing in place" apply step, AFTER archiving.
   * Parameters: [bom_id]
   */
  deleteDetailLinesByBomId: `
    DELETE FROM details_bom WHERE bom_id = ?
  `,

  /** Parameters: [status, bom_id] */
  setBomStatus: `
    UPDATE master_bom SET status = ?, updated_at = NOW() WHERE id = ?
  `,

  /** Parameters: [status, updated_by, bom_id] */
  setBomStatusWithUpdater: `
    UPDATE master_bom SET status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?
  `,

  /**
   * IDs of every OTHER active BOM for the same sku_id, read BEFORE
   * deactivateOtherActiveBomsForSku runs — MariaDB's UPDATE has no RETURNING,
   * so this is how the caller knows which BOMs it's about to deactivate (one
   * bom.deactivated event per id, per event-catalog.md's fan-out design).
   * Parameters: [sku_id, keep_bom_id]
   */
  selectOtherActiveBomsForSku: `
    SELECT id
    FROM master_bom
    WHERE sku_id = ? AND id <> ? AND status = 'active'
  `,

  /**
   * Flip every OTHER active BOM for the same sku_id to inactive — enforces
   * "only one active BOM per SKU" after a new/updated BOM is activated.
   * Parameters: [sku_id, keep_bom_id]
   */
  deactivateOtherActiveBomsForSku: `
    UPDATE master_bom
    SET status = 'inactive', updated_at = NOW()
    WHERE sku_id = ? AND id <> ? AND status = 'active'
  `,

  // ============ HISTORY QUERIES (read-only "BOM History" page) ============
  // history_bom only ever gets rows written by bomHandler.applyAndArchive
  // (see lib/approvals/module-handlers.ts) when an "update existing BOM"
  // approval is applied — it snapshots the full line set that's about to be
  // overwritten. A BOM with no history_bom rows has never been revised.

  /**
   * Paginated listing, one row per BOM header that has at least one archived
   * line — mirrors selectPaginatedGrouped's shape so the History page can
   * reuse BomTable/BomListItem as-is.
   * Params: [like, like, like, LIMIT, OFFSET]
   */
  selectHistoryPaginatedGrouped: `
    SELECT
      b.id AS bom_id, b.bom_code, s.sku_code, s.name AS sku_name,
      b.created_at,
      MIN(h.effective_from) AS effective_from,
      MAX(h.effective_till) AS effective_till,
      b.status AS status
    FROM history_bom AS h
    INNER JOIN master_bom AS b ON b.id = h.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
    GROUP BY b.id, b.bom_code, s.sku_code, s.name, b.created_at, b.status
    ORDER BY MAX(h.last_updated) DESC
    LIMIT ? OFFSET ?
  `,

  /**
   * Fetch ALL matching BOM history headers, grouped (no LIMIT/OFFSET) — feeds
   * the fuzzy-search ranking path (lib/fuzzy-search.ts) when a search term is
   * present. Same shape/WHERE as selectHistoryPaginatedGrouped.
   * Params: [like, like, like]
   */
  selectAllFilteredHistoryGrouped: `
    SELECT
      b.id AS bom_id, b.bom_code, s.sku_code, s.name AS sku_name,
      b.created_at,
      MIN(h.effective_from) AS effective_from,
      MAX(h.effective_till) AS effective_till,
      b.status AS status
    FROM history_bom AS h
    INNER JOIN master_bom AS b ON b.id = h.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
    GROUP BY b.id, b.bom_code, s.sku_code, s.name, b.created_at, b.status
    ORDER BY MAX(h.last_updated) DESC
  `,

  /** Matching COUNT for selectHistoryPaginatedGrouped. Params: [like, like, like] */
  countHistoryGrouped: `
    SELECT COUNT(DISTINCT b.id) AS total
    FROM history_bom AS h
    INNER JOIN master_bom AS b ON b.id = h.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    WHERE (? IS NULL OR b.bom_code LIKE ? OR s.sku_code LIKE ?)
  `,

  /**
   * All archived lines for one BOM, newest snapshot first — the History
   * page's detail-panel equivalent of selectDetailLinesByBomId. Params: [bom_id]
   */
  selectHistoryLinesByBomId: `
    SELECT
      b.bom_code, h.bom_id, s.sku_code,
      h.mtrl_id, h.mtrl_type, h.uom, h.amount,
      h.mtrl_cost, h.status AS material_status, b.status AS bom_status,
      h.effective_from, h.effective_till, h.last_updated,
      b.created_by,
      COALESCE(rm.name, pm.name) AS mtrl_name,
      COALESCE(rm.rm_code, pm.pm_code) AS mtrl_code,
      COALESCE(rm.status, pm.status) AS mtrl_master_status
    FROM history_bom AS h
    INNER JOIN master_bom AS b ON b.id = h.bom_id
    LEFT JOIN master_skus AS s ON s.id = b.sku_id
    LEFT JOIN master_rm AS rm ON rm.id = h.mtrl_id AND h.mtrl_type = 'rm'
    LEFT JOIN master_pm AS pm ON pm.id = h.mtrl_id AND h.mtrl_type = 'pm'
    WHERE h.bom_id = ?
    ORDER BY h.last_updated DESC, h.mtrl_type ASC, h.mtrl_id ASC
  `,
}
