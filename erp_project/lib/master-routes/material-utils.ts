import { approvalsSql } from "@/lib/queries/approvals"
import type { PoolConnection } from "mysql2/promise"

export async function insertApprovalWithItems(
  conn: PoolConnection,
  userId: number,
  module: string,
  entityId: number,
  fields: [string, string][],
): Promise<number> {
  const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, module, entityId])
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
  if (existing.status === "draft") {
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

  const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, moduleVrm, existing.id])
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
  if (existing.status === "draft") {
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

  const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, moduleMrm, existing.id])
  const approvalId = (ar as any).insertId
  for (const [field, oldVal, newVal] of diff) {
    await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, String(oldVal ?? ""), String(newVal ?? "")])
  }
  await conn.execute(setRateStatusSql, ["in_review", existing.id])
}
