import { approvalsSql } from "@/lib/queries/approvals"
import { ApiError } from "@/lib/gateway/errors"
import type { PoolConnection } from "mysql2/promise"

/**
 * Auto-generates the next RM/PM business code (e.g. "RM001", "PM014") when
 * the caller didn't supply one. Queries the live count inside the caller's
 * open transaction, so within a single bulk-import loop each row sees the
 * previous rows' inserts and never repeats a code.
 *
 * rm_code/pm_code have no DB unique constraint (unlike vendors.code /
 * master_mfgs.code), so this doesn't retry-on-collision like the VEN-/MFG-
 * generators — acceptable here since concurrent RM/PM creation is rare.
 */
export async function generateMaterialCode(
  conn: PoolConnection,
  countSql: string,
  prefix: "RM" | "PM",
): Promise<string> {
  const [rows] = await conn.execute(countSql)
  const total = (rows as any[])[0].total as number
  return `${prefix}${String(total + 1).padStart(3, "0")}`
}

type BankingFieldSql = {
  checkDuplicateGst: string
  checkDuplicateIfsc: string
  checkDuplicateAccountNumber: string
}

/**
 * Returns a "<label> "<value>" is already used by <code>" message if
 * gst_number, ifsc_number, or account_number is already used by another
 * manufacturer/vendor — or null if none collide. Shared by
 * manufacturers/route.ts and vendors/route.ts (both entities carry the same
 * 3 banking/tax fields).
 *
 * `excludeId` is 0 on create (nothing to exclude yet) or the entity's own id
 * on update, so a record being edited never flags itself as a duplicate.
 */
export async function findDuplicateBankingField(
  conn: PoolConnection,
  sql: BankingFieldSql,
  fields: { gst_number?: string | null; ifsc_number?: string | null; account_number?: string | null },
  excludeId: number,
): Promise<string | null> {
  const checks: [string | null | undefined, string, string][] = [
    [fields.gst_number,     sql.checkDuplicateGst,            "GST number"],
    [fields.ifsc_number,    sql.checkDuplicateIfsc,           "IFSC code"],
    [fields.account_number, sql.checkDuplicateAccountNumber,  "Account number"],
  ]
  for (const [value, query, label] of checks) {
    const trimmed = value?.trim()
    if (!trimmed) continue
    const [rows] = await conn.execute(query, [trimmed, excludeId])
    const dup = (rows as any[])[0]
    if (dup) return `${label} "${trimmed}" is already used by ${dup.code}`
  }
  return null
}

/** Throws 409 if any banking field collides — see findDuplicateBankingField. */
export async function assertNoDuplicateBankingFields(
  conn: PoolConnection,
  sql: BankingFieldSql,
  fields: { gst_number?: string | null; ifsc_number?: string | null; account_number?: string | null },
  excludeId: number,
): Promise<void> {
  const dup = await findDuplicateBankingField(conn, sql, fields, excludeId)
  if (dup) throw new ApiError(409, "duplicate", dup)
}

export async function insertApprovalWithItems(
  conn: PoolConnection,
  userId: number,
  module: string,
  entityId: number,
  fields: [string, string][],
): Promise<number> {
  // Always a brand-new record/rate — every caller of this helper inserts a
  // fresh row (RM_MAT/PM_MAT create, or a first-time RM_VRM/RM_RATE/PM_VRM/PM_RATE
  // rate). Edits to an EXISTING row go through applyVendorRateApproval /
  // applyMfgRateApproval below, or the diff-based inline paths in route.ts.
  const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, module, entityId, "create"])
  const approvalId = (ar as any).insertId
  for (const [field, val] of fields) {
    if (val) await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, "", val])
  }
  return approvalId
}

// Handles the "existing vendor rate" approval path (used by add-rates + rm create-full).
export async function applyVendorRateApproval(
  conn: PoolConnection,
  userId: number,
  moduleVrm: string,
  existing: any,
  v: any,
  today: string,
  setVendorRateStatusSql: string,
): Promise<void> {
  if (existing.status === "in_review") return
  if (existing.status === "rejected") {
    const [rejRows] = await conn.execute(approvalsSql.selectLatestRejection, [moduleVrm, existing.id])
    const rej = (rejRows as any[])[0]
    if (rej && rej.raised_by !== userId) return
  }
  const [pendingRows] = await conn.execute(approvalsSql.hasPending, [moduleVrm, existing.id])
  if ((pendingRows as any[])[0]?.cnt > 0) return

  const diff = ([
    ["curr_rate", existing.curr_rate, v.curr_rate],
    ["moq", existing.moq, v.moq],
    ["uom", existing.uom, v.rate_uom],
    ["effective_from", existing.effective_from, v.effective_from ?? today],
  ] as [string, unknown, unknown][]).filter(([, o, n]) => String(o ?? "") !== String(n ?? ""))
  if (diff.length === 0) return

  const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, moduleVrm, existing.id, "edit"])
  const approvalId = (ar as any).insertId
  for (const [field, oldVal, newVal] of diff) {
    await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, String(oldVal ?? ""), String(newVal ?? "")])
  }
  await conn.execute(setVendorRateStatusSql, ["in_review", existing.id])
}

// Handles the "existing mfg rate" approval path (used by add-rates for both RM and PM).
export async function applyMfgRateApproval(
  conn: PoolConnection,
  userId: number,
  moduleMrm: string,
  existing: any,
  m: any,
  today: string,
  setRateStatusSql: string,
): Promise<void> {
  if (existing.status === "in_review") return
  if (existing.status === "rejected") {
    const [rejRows] = await conn.execute(approvalsSql.selectLatestRejection, [moduleMrm, existing.id])
    const rej = (rejRows as any[])[0]
    if (rej && rej.raised_by !== userId) return
  }
  const [pendingRows] = await conn.execute(approvalsSql.hasPending, [moduleMrm, existing.id])
  if ((pendingRows as any[])[0]?.cnt > 0) return

  const diff = ([
    ["curr_rate", existing.curr_rate, m.curr_rate],
    ["uom", existing.uom, m.rate_uom],
    ["effective_from", existing.effective_from, m.effective_from ?? today],
  ] as [string, unknown, unknown][]).filter(([, o, n]) => String(o ?? "") !== String(n ?? ""))
  if (diff.length === 0) return

  const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, moduleMrm, existing.id, "edit"])
  const approvalId = (ar as any).insertId
  for (const [field, oldVal, newVal] of diff) {
    await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, String(oldVal ?? ""), String(newVal ?? "")])
  }
  await conn.execute(setRateStatusSql, ["in_review", existing.id])
}
