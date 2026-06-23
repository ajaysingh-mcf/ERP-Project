// POST /api/approvals/[id]
// Body: { action: "approve" | "reject", remarks?: string }
//
// Approve: applies the proposed field changes to the master table, archives the
//          old values to the respective history table, and sets the entity back
//          to "active".
//
// Reject: reverts the entity status to "draft" (re-editable) and stores the
//         mandatory rejection remarks in the approvals record.
//
// Auth: only users with the "admin" or "manager" role may call this endpoint.

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, pool } from "@/lib/db"
import { approvalsSql } from "@/lib/queries/approvals"
import { skus as skuSql } from "@/lib/queries/skus"
import { rawMaterials as rmSql } from "@/lib/queries/raw-materials"
import { packingMaterials as pmSql } from "@/lib/queries/packing-materials"

// ── Status setter ────────────────────────────────────────────────────────────

async function setEntityStatus(
  conn: any,
  module: string,
  entityId: number,
  status: string
) {
  if (module === "SKU")     await conn.execute(skuSql.setStatus,           [status, entityId])
  if (module === "RM_RATE") await conn.execute(rmSql.setRateStatus,        [status, entityId])
  if (module === "PM_RATE") await conn.execute(pmSql.setRateStatus,        [status, entityId])
  if (module === "RM_VRM")  await conn.execute(rmSql.setVendorRateStatus,  [status, entityId])
  if (module === "PM_VRM")  await conn.execute(pmSql.setVendorRateStatus,  [status, entityId])
  if (module === "RM_MAT")  await conn.execute(rmSql.setBaseStatus,        [status, entityId])
  if (module === "PM_MAT")  await conn.execute(pmSql.setBaseStatus,        [status, entityId])
}

// ── Apply approved changes + archive old snapshot ────────────────────────────

type DiffItem = { field_name: string; old_value: string; new_value: string }

async function applyAndArchive(
  conn: any,
  module: string,
  entityId: number,
  items: DiffItem[],
  approverId: number
) {
  const fieldMap = Object.fromEntries(items.map((i) => [i.field_name, i.new_value]))

  if (module === "SKU") {
    const [rows] = await conn.execute(skuSql.selectById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`SKU ${entityId} not found`)

    // Archive the pre-approval snapshot.
    await conn.execute(skuSql.insertHistory, [
      cur.id,
      cur.sku_code,
      cur.name,
      cur.brand ?? null,
      cur.category ?? null,
      cur.status ?? null,
      approverId,
    ])

    // Apply approved field values; restore status to active.
    await conn.execute(skuSql.updateSku, [
      fieldMap.name     ?? cur.name,
      fieldMap.brand    ?? cur.brand ?? null,
      fieldMap.category ?? cur.category ?? null,
      "active",
      entityId,
    ])
  }

  if (module === "RM_RATE") {
    const [rows] = await conn.execute(rmSql.selectRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`RM rate ${entityId} not found`)

    // Archive old rate to history_mrm.
    await conn.execute(rmSql.archiveToHistoryMrm, [
      cur.mfg_id,
      cur.rm_id,
      cur.approved_vendor_id ?? 0,
      cur.curr_rate,
      cur.effective_from,
      null,
      cur.status === "active" ? 1 : 0,
    ])

    // Apply approved values and restore to active.
    await conn.execute(rmSql.updateMfgRate, [
      fieldMap.curr_rate      !== undefined ? Number(fieldMap.curr_rate)      : cur.curr_rate,
      fieldMap.uom            ?? cur.uom,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
    await conn.execute(rmSql.setRateStatus, ["active", entityId])
  }

  if (module === "PM_RATE") {
    const [rows] = await conn.execute(pmSql.selectRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`PM rate ${entityId} not found`)

    // Archive old rate to history_mrm.
    const [vRows] = await conn.execute(
      "SELECT vendor_id FROM pm_vrm_dynamic WHERE pm_id = ? AND vendor_id IS NOT NULL LIMIT 1",
      [cur.pm_id]
    )
    const historyVendorId = (vRows as any[])[0]?.vendor_id ?? 0
    await conn.execute(pmSql.archiveToHistoryMrm, [
      cur.mfg_id,
      cur.pm_id,
      historyVendorId,
      cur.curr_rate,
      cur.effective_from,
      null,
      cur.status === "active" ? 1 : 0,
    ])

    // Apply approved values and restore to active.
    await conn.execute(pmSql.updateMfgRate, [
      fieldMap.curr_rate      !== undefined ? Number(fieldMap.curr_rate)      : cur.curr_rate,
      fieldMap.uom            ?? cur.uom,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
    await conn.execute(pmSql.setRateStatus, ["active", entityId])
  }

  if (module === "RM_VRM") {
    const [rows] = await conn.execute(rmSql.selectVendorRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`RM vendor rate ${entityId} not found`)

    // Archive old rate to history_vrm.
    await conn.execute(rmSql.archiveToHistoryVrm, [
      cur.rm_id,
      cur.vendor_id,
      cur.curr_rate,
      cur.effective_from,
      cur.effective_to,
      cur.status,
    ])

    // Apply approved values and restore to active.
    await conn.execute(rmSql.updateVendorRate, [
      fieldMap.curr_rate      !== undefined ? Number(fieldMap.curr_rate)      : cur.curr_rate,
      fieldMap.moq            !== undefined ? Number(fieldMap.moq)            : cur.moq,
      fieldMap.uom            ?? cur.uom,
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
    await conn.execute(rmSql.setVendorRateStatus, ["active", entityId])
  }

  if (module === "RM_MAT") {
    const [rows] = await conn.execute(rmSql.selectBaseById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`RM base record ${entityId} not found`)

    // Apply approved field values; restore status to active (or approved proposed status).
    await conn.execute(rmSql.update, [
      fieldMap.name      !== undefined ? fieldMap.name      : cur.name,
      fieldMap.make      !== undefined ? fieldMap.make      : cur.make,
      fieldMap.type      !== undefined ? fieldMap.type      : cur.type,
      fieldMap.uom       !== undefined ? fieldMap.uom       : cur.uom,
      fieldMap.status    !== undefined ? fieldMap.status    : "active",
      fieldMap.hsn_code  !== undefined ? fieldMap.hsn_code  : cur.hsn_code,
      fieldMap.inci_name !== undefined ? fieldMap.inci_name : cur.inci_name,
      entityId,
    ])
  }

  if (module === "PM_MAT") {
    const [rows] = await conn.execute(pmSql.selectBaseById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`PM base record ${entityId} not found`)

    await conn.execute(pmSql.update, [
      fieldMap.name     !== undefined ? fieldMap.name     : cur.name,
      fieldMap.type     !== undefined ? fieldMap.type     : cur.type,
      fieldMap.uom      !== undefined ? fieldMap.uom      : cur.uom,
      fieldMap.status   !== undefined ? fieldMap.status   : "active",
      fieldMap.hsn_code !== undefined ? fieldMap.hsn_code : cur.hsn_code,
      entityId,
    ])
  }

  if (module === "PM_VRM") {
    const [rows] = await conn.execute(pmSql.selectVendorRateById, [entityId])
    const cur = (rows as any[])[0]
    if (!cur) throw new Error(`PM vendor rate ${entityId} not found`)

    // Archive old rate to history_vrm.
    await conn.execute(pmSql.archiveToHistoryVrm, [
      cur.pm_id,
      cur.vendor_id,
      cur.curr_rate,
      cur.effective_from,
      cur.effective_to,
      cur.status,
    ])

    // Apply approved values and restore to active.
    await conn.execute(pmSql.updateVendorRate, [
      fieldMap.curr_rate      !== undefined ? Number(fieldMap.curr_rate)      : cur.curr_rate,
      fieldMap.moq            !== undefined ? Number(fieldMap.moq)            : cur.moq,
      fieldMap.uom            ?? cur.uom,
      "active",
      fieldMap.effective_from ?? cur.effective_from,
      entityId,
    ])
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  // Only admin / manager may approve or reject.
  const roles: string[] = session.user.roles ?? []
  if (!roles.some((r) => ["admin", "manager"].includes(r))) {
    return NextResponse.json({ error: "Forbidden — admin or manager role required" }, { status: 403 })
  }

  const { id } = await params
  const approvalId = parseInt(id)
  if (isNaN(approvalId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const body = await req.json()
  const { action, remarks } = body as { action: string; remarks?: string }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  // Rejection remarks are mandatory.
  if (action === "reject" && !remarks?.trim()) {
    return NextResponse.json({ error: "Rejection remarks are required" }, { status: 400 })
  }

  const approverId = parseInt(session.user.id)

  // Fetch the approval header.
  const [approval] = await query<any>(approvalsSql.getById, [approvalId])
  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 })
  if (approval.status !== "pending") {
    return NextResponse.json({ error: "This approval has already been actioned" }, { status: 409 })
  }

  const items = await query<DiffItem>(approvalsSql.getItems, [approvalId])

  const conn = await pool.getConnection()
  await conn.beginTransaction()
  try {
    if (action === "approve") {
      await applyAndArchive(conn, approval.module, approval.entity_id, items, approverId)
      await conn.execute(approvalsSql.markApproved, [approverId, approvalId])
    } else {
      // Revert entity to "draft" — submitter can modify and resubmit.
      await setEntityStatus(conn, approval.module, approval.entity_id, "draft")
      await conn.execute(approvalsSql.markRejected, [approverId, remarks!.trim(), approvalId])
    }
    await conn.commit()
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await conn.rollback()
    console.error("Approval action error:", err)
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
