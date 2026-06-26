import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, pool } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { approvalsSql } from "@/lib/queries/approvals"
import { skus as skusSql } from "@/lib/queries/skus"
import { manufacturers as mfgsSql } from "@/lib/queries/manufacturers"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"
import type { PoolConnection } from "mysql2/promise"

// GET /api/purchase-orders — list all POs with MFG + SKU details
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const rows = await query<any>(purchaseOrdersSql.selectAll, [])
  return NextResponse.json(rows)
}

// POST /api/purchase-orders
// Handles two actions via the 'action' field in the request body:
//
//   bulk_csv — { action:"bulk_csv", key, filename, rowCount }
//     Saves an uploaded CSV/Excel S3 key into po_bulk_uploads and creates a
//     single PO_BULK approval card. No POs are inserted yet.
//
//   (default) — { mfg_id, sku_code, qty, expected_on, destination, reason, po_type? }
//     Creates a single PO as draft and submits it for approval.
//
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const body = await req.json()

  // ── bulk_csv: store S3 key + filename in approval_items, one approval for the batch ──
  // entity_id = uploading user's id (no separate table needed).
  if (body.action === "bulk_csv") {
    const { key, filename } = body
    if (!key)      return NextResponse.json({ error: "S3 key is required." }, { status: 400 })
    if (!filename) return NextResponse.json({ error: "Filename is required." }, { status: 400 })

    const conn: PoolConnection = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PO_BULK", userId])
      const approvalId = (ar as any).insertId

      const diffItems: [string, string, string][] = [
        ["filename", "", filename],
        ["s3_key",   "", key],
      ]
      for (const [field, oldVal, newVal] of diffItems) {
        await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, oldVal, newVal])
      }

      await conn.commit()
      return NextResponse.json({ ok: true, approval_id: approvalId })
    } catch (err: any) {
      await conn.rollback()
      console.error("Bulk CSV PO create error:", err)
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }
  // ── end bulk_csv ────────────────────────────────────────────────────────────
  const { mfg_id, sku_code, qty, expected_on, destination, reason, po_type = "impromptu" } = body

  if (!mfg_id)                   return NextResponse.json({ error: "Manufacturer is required." }, { status: 400 })
  if (!sku_code)                  return NextResponse.json({ error: "SKU is required." }, { status: 400 })
  if (!qty || Number(qty) <= 0)  return NextResponse.json({ error: "Quantity must be greater than 0." }, { status: 400 })
  if (!["normal", "impromptu"].includes(po_type)) {
    return NextResponse.json({ error: "Invalid po_type." }, { status: 400 })
  }

  // Verify SKU is active
  const skuRows = await query<{ status: string }>(skusSql.selectStatusByCode, [sku_code])
  if (!skuRows[0]) return NextResponse.json({ error: "SKU not found." }, { status: 400 })
  if (skuRows[0].status !== "active") {
    return NextResponse.json(
      { error: `SKU is currently '${skuRows[0].status.replace(/_/g, " ")}' and cannot be used for a new PO.` },
      { status: 400 }
    )
  }

  // Generate po_no based on type
  let po_no: string
  const year = new Date().getFullYear()
  if (po_type === "normal") {
    const countRows = await query<{ cnt: number }>(purchaseOrdersSql.countNormal, [])
    const seq = (Number(countRows[0]?.cnt ?? 0) + 1).toString().padStart(3, "0")
    po_no = `PO-${year}-${seq}`
  } else {
    const countRows = await query<{ cnt: number }>(purchaseOrdersSql.countImpromptu, [])
    const seq = (Number(countRows[0]?.cnt ?? 0) + 1).toString().padStart(3, "0")
    po_no = `IMP-${year}-${seq}`
  }

  const eventId = `po-new-${Date.now()}`
  recordRawEvent("PO", eventId, { mfg_id, sku_code, qty, expected_on, destination, reason, po_type })

  // ── Normal PO: insert directly as raised, no approval needed ──────────────
  if (po_type === "normal") {
    const conn: PoolConnection = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [poResult] = await conn.execute(purchaseOrdersSql.insertNormal, [
        po_no, Number(mfg_id), sku_code, Number(qty), expected_on || null, destination || null,
      ])
      const poId = (poResult as any).insertId
      await conn.commit()
      recordProcessedEvent("PO", eventId, { poId, po_no })
      return NextResponse.json({ ok: true, po_no })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("PO", eventId, { mfg_id, sku_code, qty, expected_on, destination }, err.message)
      if (err.code === "ER_DUP_ENTRY") {
        return NextResponse.json({ error: "PO number already exists, please retry." }, { status: 409 })
      }
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  // ── Impromptu PO: insert as draft and submit for approval ─────────────────
  const conn: PoolConnection = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const [poResult] = await conn.execute(purchaseOrdersSql.insert, [
      po_no, Number(mfg_id), sku_code, Number(qty), expected_on || null, po_type, destination || null,
    ])
    const poId = (poResult as any).insertId

    const [mfgRows] = await conn.execute(mfgsSql.selectNameById, [Number(mfg_id)])
    const mfg = (mfgRows as any[])[0] ?? { code: mfg_id, name: mfg_id }

    const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PO", poId])
    const approvalId = (ar as any).insertId

    const diffItems: [string, string, string][] = [
      ["po_no",        "", po_no],
      ["manufacturer", "", `${mfg.code} — ${mfg.name}`],
      ["sku_code",     "", sku_code],
      ["qty",          "", String(qty)],
      ["expected_on",  "", expected_on || ""],
      ["destination",  "", destination || ""],
    ]
    if (reason?.trim()) diffItems.push(["reason", "", reason.trim()])
    for (const [field, oldVal, newVal] of diffItems) {
      await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, oldVal, newVal])
    }

    await conn.commit()
    recordProcessedEvent("PO", eventId, { poId, po_no, approvalId })
    return NextResponse.json({ ok: true, approval_id: approvalId, po_no })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("PO", eventId, { mfg_id, sku_code, qty, expected_on, destination, reason }, err.message)
    if (err.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "PO number already exists, please retry." }, { status: 409 })
    }
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
