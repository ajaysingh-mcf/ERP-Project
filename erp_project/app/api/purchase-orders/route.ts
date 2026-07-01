import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, pool } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { approvalsSql } from "@/lib/queries/approvals"
import { skus as skusSql } from "@/lib/queries/skus"
import { manufacturers as mfgsSql } from "@/lib/queries/manufacturers"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"
import type { PoolConnection } from "mysql2/promise"
import logger from "@/lib/logger"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { poActionSchema } from "@/lib/validation/purchase-orders"

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
// Auth + body validation handled by withGateway (see lib/gateway/with-gateway.ts).
export const POST = withGateway({
  schema: poActionSchema,
  handler: async ({ body, session, ctx }) => {
  const userId = Number(session.user.id)

  // ── bulk_csv: store S3 key + filename in approval_items, one approval for the batch ──
  // entity_id = uploading user's id (no separate table needed).
  if ("key" in body) {
    const { key, filename } = body

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
      logger.error({ ...ctx, err: err.message, stack: err.stack, message: "Bulk CSV PO create failed" })
      throw new ApiError(500, "internal", "Database error: " + err.message)
    } finally {
      conn.release()
    }
  }
  // ── end bulk_csv ────────────────────────────────────────────────────────────
  const { mfg_id, sku_code, qty, expected_on, destination, reason, po_type } = body

  // Resolve brand from SKU and validate status in one query
  const skuRows = await query<{ status: string; brand: string | null }>(
    skusSql.selectStatusAndBrandByCode, [sku_code]
  )
  if (!skuRows[0]) throw new ApiError(400, "sku_not_found", "SKU not found.")
  if (skuRows[0].status !== "active") {
    throw new ApiError(
      400,
      "sku_not_active",
      `SKU is currently '${skuRows[0].status.replace(/_/g, " ")}' and cannot be used for a new PO.`
    )
  }

  // Map known brand names to their short PO codes (case-insensitive)
  const BRAND_CODES: Record<string, string> = {
    mcaffeine: "MCAFF",
    hyphen:    "HYP",
  }
  const rawBrand = skuRows[0].brand?.trim() || sku_code.split("-")[0]
  const brand    = (BRAND_CODES[rawBrand.toLowerCase()] ?? rawBrand).toUpperCase()

  // Generate po_no: {Brand}-{PO|IMP}-{yyyymm}-{nnnn}, sequence scoped per brand+type+month
  const year    = new Date().getFullYear()
  const month   = String(new Date().getMonth() + 1).padStart(2, "0")
  const typeTag = po_type === "normal" ? "PO" : "IMP"
  const poPrefix = `${brand}-${typeTag}-${year}${month}`
  const countRows = await query<{ cnt: number }>(purchaseOrdersSql.countByPrefix, [`${poPrefix}-%`])
  const seq  = (Number(countRows[0]?.cnt ?? 0) + 1).toString().padStart(3, "0")
  const po_no = `${poPrefix}-${seq}`

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
      logger.error({ ...ctx, err: err.message, stack: err.stack, message: "Normal PO create failed" })
      recordFailedEvent("PO", eventId, { mfg_id, sku_code, qty, expected_on, destination }, err.message)
      if (err.code === "ER_DUP_ENTRY") {
        throw new ApiError(409, "duplicate", "PO number already exists, please retry.")
      }
      throw new ApiError(500, "internal", "Database error: " + err.message)
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
      throw new ApiError(409, "duplicate", "PO number already exists, please retry.")
    }
    throw new ApiError(500, "internal", "Database error: " + err.message)
  } finally {
    conn.release()
  }
  },
})
