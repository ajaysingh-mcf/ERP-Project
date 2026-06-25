// PUT /api/purchase-orders/[id]  — re-edit a draft PO and re-submit for approval
// PATCH /api/purchase-orders/[id] — update attachment key (S3 file reference)

import { NextRequest, NextResponse } from "next/server"
import type { PoolConnection } from "mysql2/promise"
import { auth } from "@/lib/auth"
import { query, execute, pool } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { s3FilesSql } from "@/lib/queries/s3-files"
import { approvalsSql } from "@/lib/queries/approvals"
import { skus as skusSql } from "@/lib/queries/skus"
import { manufacturers as mfgsSql } from "@/lib/queries/manufacturers"
import { deleteFile } from "@/lib/s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const { id } = await params
  const poId = parseInt(id)
  if (isNaN(poId)) return NextResponse.json({ error: "Invalid PO id" }, { status: 400 })

  const body = await req.json()
  const { mfg_id, sku_code, qty, expected_on, destination, reason } = body

  if (!mfg_id)                  return NextResponse.json({ error: "Manufacturer is required." }, { status: 400 })
  if (!sku_code)                 return NextResponse.json({ error: "SKU is required." }, { status: 400 })
  if (!qty || Number(qty) <= 0) return NextResponse.json({ error: "Quantity must be greater than 0." }, { status: 400 })

  // Verify SKU is active
  const skuRows = await query<{ status: string }>(skusSql.selectStatusByCode, [sku_code])
  if (!skuRows[0]) return NextResponse.json({ error: "SKU not found." }, { status: 400 })
  if (skuRows[0].status !== "active") {
    return NextResponse.json(
      { error: `SKU is currently '${skuRows[0].status.replace(/_/g, " ")}' and cannot be used for a PO.` },
      { status: 400 }
    )
  }

  // Verify PO exists and is draft
  const poRows = await query<any>(purchaseOrdersSql.selectForEdit, [poId])
  const po = poRows[0]
  if (!po) return NextResponse.json({ error: "PO not found." }, { status: 404 })
  if (po.status !== "draft") {
    return NextResponse.json({ error: "Only draft POs can be edited." }, { status: 409 })
  }

  // Block if there is already a pending approval (approval not yet reviewed)
  const pendingRows = await query<any>(approvalsSql.hasPending, ["PO", poId])
  if (pendingRows.length > 0) {
    return NextResponse.json(
      { error: "A pending approval already exists for this PO. Wait for it to be reviewed before re-editing." },
      { status: 409 }
    )
  }

  // Verify current user is the original submitter
  const raisedRows = await query<any>(purchaseOrdersSql.selectRaisedBy, [poId])
  const raisedBy = raisedRows[0]?.raised_by
  if (raisedBy && raisedBy !== userId) {
    return NextResponse.json({ error: "Only the original submitter can re-edit this PO." }, { status: 403 })
  }

  const eventId = `po-${poId}-${Date.now()}`
  console.log(`[events] PO edit id=${poId} — firing raw event ${eventId}`)
  recordRawEvent("PO", eventId, { poId, mfg_id, sku_code, qty, expected_on, destination, reason })

  const conn: PoolConnection = await pool.getConnection()
  await conn.beginTransaction()
  try {
    // Update PO fields
    await conn.execute(purchaseOrdersSql.updateDraft, [
      Number(mfg_id), sku_code, Number(qty), expected_on || null, destination || null, poId,
    ])

    // Fetch MFG details for readable diff
    const [mfgRows] = await conn.execute(mfgsSql.selectNameById, [Number(mfg_id)])
    const mfg = (mfgRows as any[])[0] ?? { code: mfg_id, name: String(mfg_id) }

    // Insert new approval record
    const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PO", poId])
    const approvalId = (ar as any).insertId

    // Insert approval_items so the approver sees the full request
    const diffItems: [string, string, string][] = [
      ["po_no",        "", po.po_no],
      ["manufacturer", "", `${mfg.code} — ${mfg.name}`],
      ["sku_code",     "", sku_code],
      ["qty",          "", String(qty)],
      ["expected_on",  "", expected_on || ""],
      ["destination",  "", destination || ""],
    ]
    if (reason?.trim()) {
      diffItems.push(["reason", "", reason.trim()])
    }
    for (const [field, oldVal, newVal] of diffItems) {
      await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, oldVal, newVal])
    }

    await conn.commit()
    recordProcessedEvent("PO", eventId, { poId, approvalId })
    return NextResponse.json({ ok: true, approval_id: approvalId })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("PO", eventId, { poId, mfg_id, sku_code, qty }, err.message)
    console.error("PO re-edit error:", err)
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}

// PATCH /api/purchase-orders/[id]
// Body: { attachment_key: string | null }
// Sets or clears the S3 attachment on a PO. Deletes the old S3 object when replacing.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const { id } = await params
  const poId = parseInt(id)
  if (isNaN(poId)) return NextResponse.json({ error: "Invalid PO id" }, { status: 400 })

  const { attachment_key } = await req.json()

  // Verify current user is the original submitter
  const raisedRows = await query<any>(purchaseOrdersSql.selectRaisedBy, [poId])
  const raisedBy = raisedRows[0]?.raised_by
  if (raisedBy && raisedBy !== userId) {
    return NextResponse.json({ error: "Only the original submitter can update this PO." }, { status: 403 })
  }

  // Fetch existing key so we can delete the old S3 object
  const existing = await query<{ attachment_key: string | null }>(s3FilesSql.getPoAttachment, [poId])
  const oldKey = existing[0]?.attachment_key ?? null

  await execute(s3FilesSql.updatePoAttachment, [attachment_key ?? null, poId])

  // Eager cleanup: delete replaced file from S3 (fire-and-forget, don't block response)
  if (oldKey && oldKey !== attachment_key) {
    deleteFile(oldKey).catch((err) => console.error("[s3] delete old attachment failed:", err))
  }

  return NextResponse.json({ ok: true })
}
