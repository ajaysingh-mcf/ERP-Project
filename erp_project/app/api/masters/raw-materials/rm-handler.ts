import { NextResponse } from "next/server"
import { query, pool } from "@/lib/db"
import { rawMaterials } from "@/lib/queries/raw-materials"
import { approvalsSql } from "@/lib/queries/approvals"
import { parseS3Import } from "@/lib/import-s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import logger from "@/lib/logger"
import { insertApprovalWithItems, applyVendorRateApproval, applyMfgRateApproval, generateMaterialCode } from "../../../../lib/master-routes/material-utils"
import { roundToWholeNumber, roundToTwoDecimals } from "@/lib/numeric"
import type { PoolConnection } from "mysql2/promise"

async function toRmParams(conn: PoolConnection, r: any, status = "in_review"): Promise<any[]> {
  return [
    r.rm_code?.trim() || await generateMaterialCode(conn, rawMaterials.countTotal, "RM"), r.name.trim(),
    r.make?.trim() || null, r.type?.trim() || null,
    r.uom?.trim() || null, status,
    r.hsn_code?.trim() || null, r.inci_name?.trim() || null,
  ]
}

function toRmVendorRateParams(rmId: number, r: any, today: string): any[] {
  return [
    rmId, r.vendor_id ? Number(r.vendor_id) : null,
    r.vendor_code?.trim() || null,
    r.curr_rate ? roundToTwoDecimals(r.curr_rate) : 0,
    r.moq ? roundToWholeNumber(r.moq) : null,
    r.rate_uom?.trim() || null,
    r.effective_from?.trim() || today, null, "in_review",
  ]
}

function toRmMfgRateParams(rmId: number, m: any, today: string): any[] {
  return [
    rmId, m.mfg_id ? Number(m.mfg_id) : null,
    m.mfg_code?.trim() || null,
    m.curr_rate ? roundToTwoDecimals(m.curr_rate) : 0,
    m.rate_uom?.trim() || null,
    m.approved_vendor_id ? Number(m.approved_vendor_id) : null,
    m.approved_vendor_code?.trim() || null,
    m.effective_from?.trim() || today, "in_review",
  ]
}

export async function rmCreate(body: any, userId: number, ctx: object): Promise<NextResponse> {
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const logCtx = { ...ctx, eventId: makeEventId("RM_MAT", "create"), module: "RM_Create" }
  logger.info({ ...logCtx, name: body.name.trim(), message: "RM Create Started" })
  recordRawEvent("RM_MAT", logCtx.eventId, { name: body.name.trim() })

  const conn = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const [rmResult] = await conn.execute(rawMaterials.insert, await toRmParams(conn, body))
    const rmId = (rmResult as any).insertId

    await insertApprovalWithItems(conn, userId, "RM_MAT", rmId, [
      ["name", body.name.trim()],
      ["make", body.make?.trim() || ""],
      ["type", body.type?.trim() || ""],
      ["uom", body.uom?.trim() || ""],
      ["hsn_code", body.hsn_code?.trim() || ""],
      ["inci_name", body.inci_name?.trim() || ""],
    ])

    if (body.vendor_code?.trim()) {
      const [vResult] = await conn.execute(rawMaterials.insertVendorRate, toRmVendorRateParams(rmId, body, today))
      const vrmId = (vResult as any).insertId
      await insertApprovalWithItems(conn, userId, "RM_VRM", vrmId, [
        ["curr_rate", body.curr_rate ? String(body.curr_rate) : ""],
        ["moq", body.moq ? String(body.moq) : ""],
        ["uom", body.rate_uom?.trim() || ""],
        ["effective_from", body.effective_from?.trim() || today],
      ])
    } else if (body.mfg_code?.trim()) {
      const [mResult] = await conn.execute(rawMaterials.insertMfgRate, toRmMfgRateParams(rmId, body, today))
      const mrmId = (mResult as any).insertId
      await insertApprovalWithItems(conn, userId, "RM_RATE", mrmId, [
        ["curr_rate", body.curr_rate ? String(body.curr_rate) : ""],
        ["uom", body.rate_uom?.trim() || ""],
        ["effective_from", body.effective_from?.trim() || today],
      ])
    }

    await conn.commit()
    recordProcessedEvent("RM_MAT", logCtx.eventId, { id: rmId })
    logger.info({ ...logCtx, rmId, message: "RM created in review" })
    return NextResponse.json({ id: rmId })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("RM_MAT", logCtx.eventId, { name: body.name.trim() }, err.message)
    logger.error({ ...logCtx, error: err.message, message: "Raw material create error" })
    if (err.code === "ER_DUP_ENTRY")
      return NextResponse.json({ error: `RM code "${body.rm_code?.trim()}" already exists` }, { status: 409 })
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function rmCheckDuplicate(body: any, ctx: object): Promise<NextResponse> {
  const { name, make, inci_name } = body
  if (!inci_name?.trim() || !name?.trim() || !make)
    return NextResponse.json({ error: "name, make, inci_name are required" }, { status: 400 })
  try {
    const rows = await query<{ id: number }>(rawMaterials.checkDuplicate, [
      name.trim(), make?.trim() || "", inci_name?.trim() || "",
    ])
    return NextResponse.json({ exists: rows.length > 0 })
  } catch (err: any) {
    logger.error({ ...ctx, error: err.message, message: "Raw material check error" })
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export async function rmCheckVendor(body: any, ctx: object): Promise<NextResponse> {
  const { name, make, inci_name, vendor_id } = body
  if (!name?.trim() || !vendor_id)
    return NextResponse.json({ error: "name and vendor_id are required" }, { status: 400 })
  try {
    const rms = await query<{ id: number }>(rawMaterials.checkDuplicate, [
      name.trim(), make?.trim() || "", inci_name?.trim() || "",
    ])
    if (rms.length === 0) return NextResponse.json({ exists: false })
    const rates = await query<any>(rawMaterials.checkVendorRate, [rms[0].id, Number(vendor_id)])
    if (rates.length === 0) return NextResponse.json({ exists: false })
    const r = rates[0]
    return NextResponse.json({
      exists: true,
      existing: { curr_rate: r.curr_rate, moq: r.moq, uom: r.uom, effective_from: r.effective_from },
    })
  } catch (err: any) {
    logger.error({ ...ctx, error: err.message, message: "Vendor rate check error" })
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export async function rmCreateFull(body: any, userId: number, ctx: object): Promise<NextResponse> {
  const { rm } = body
  const vendorList = Array.isArray(body.vendors) ? body.vendors : []
  const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
  if (!rm?.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const logCtx = { ...ctx, eventId: makeEventId("RM_FULL", "create-full"), module: "RM_CreateFull" }
  logger.info({ ...logCtx, name: rm.name.trim(), vendors: vendorList.length, mfgs: mfgList.length, message: "RM Create-Full Started" })
  recordRawEvent("RM_FULL", logCtx.eventId, { name: rm.name.trim(), vendorCount: vendorList.length, mfgCount: mfgList.length })

  const conn = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const [rmResult] = await conn.execute(rawMaterials.insert, await toRmParams(conn, rm))
    const rmId = (rmResult as any).insertId

    await insertApprovalWithItems(conn, userId, "RM_MAT", rmId, [
      ["name", rm.name.trim()],
      ["make", rm.make?.trim() || ""],
      ["type", rm.type?.trim() || ""],
      ["uom", rm.uom?.trim() || ""],
      ["hsn_code", rm.hsn_code?.trim() || ""],
      ["inci_name", rm.inci_name?.trim() || ""],
    ])

    for (const v of vendorList) {
      const vendorId = v.vendor_id ? Number(v.vendor_id) : null
      const [existingRows] = await conn.execute(rawMaterials.checkVendorRate, [rmId, vendorId])
      const existing = (existingRows as any[])[0]
      if (existing) {
        await applyVendorRateApproval(conn, userId, "RM_VRM", existing, v, today, rawMaterials.setVendorRateStatus)
      } else {
        const [vResult] = await conn.execute(rawMaterials.insertVendorRate, toRmVendorRateParams(rmId, v, today))
        const vrmId = (vResult as any).insertId
        await insertApprovalWithItems(conn, userId, "RM_VRM", vrmId, [
          ["curr_rate", v.curr_rate ? String(v.curr_rate) : ""],
          ["moq", v.moq ? String(v.moq) : ""],
          ["uom", v.rate_uom?.trim() || ""],
          ["effective_from", v.effective_from?.trim() || today],
        ])
      }
    }

    for (const m of mfgList) {
      const mfgId = m.mfg_id ? Number(m.mfg_id) : null
      const [existingRows] = await conn.execute(rawMaterials.checkMfgRate, [rmId, mfgId])
      const existing = (existingRows as any[])[0]
      if (existing) {
        await applyMfgRateApproval(conn, userId, "RM_RATE", existing, m, today, rawMaterials.setRateStatus)
      } else {
        const [mResult] = await conn.execute(rawMaterials.insertMfgRate, toRmMfgRateParams(rmId, m, today))
        const mrmId = (mResult as any).insertId
        await insertApprovalWithItems(conn, userId, "RM_RATE", mrmId, [
          ["curr_rate", m.curr_rate ? String(m.curr_rate) : ""],
          ["uom", m.rate_uom?.trim() || ""],
          ["effective_from", m.effective_from?.trim() || today],
        ])
      }
    }

    await conn.commit()
    recordProcessedEvent("RM_FULL", logCtx.eventId, { id: rmId })
    logger.info({ ...logCtx, rmId, message: "RM created full in review" })
    return NextResponse.json({ id: rmId })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("RM_FULL", logCtx.eventId, { name: rm.name.trim() }, err.message)
    logger.error({ ...logCtx, error: err.message, message: "Raw material create-full error" })
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function rmAddRates(body: any, userId: number, ctx: object): Promise<NextResponse> {
  const { name, make, inci_name } = body
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 })
  const vendorList = Array.isArray(body.vendors) ? body.vendors : []
  const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
  if (vendorList.length === 0 && mfgList.length === 0)
    return NextResponse.json({ error: "Provide at least one vendor rate or manufacturer" }, { status: 400 })

  const logCtx = { ...ctx, eventId: makeEventId("RM_RATES", "add-rates"), module: "RM_AddRates" }
  logger.info({ ...logCtx, name: name.trim(), message: "RM Add Rates Started" })
  recordRawEvent("RM_RATES", logCtx.eventId, { name: name.trim() })

  try {
    const rms = await query<{ id: number }>(rawMaterials.checkDuplicate, [
      name.trim(), make?.trim() || "", inci_name?.trim() || "",
    ])
    if (rms.length === 0) return NextResponse.json({ error: "Material not found" }, { status: 404 })
    const rmId = rms[0].id
    const today = new Date().toISOString().slice(0, 10)

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      for (const v of vendorList) {
        const vendorId = v.vendor_id ? Number(v.vendor_id) : null
        const [existingRows] = await conn.execute(rawMaterials.checkVendorRate, [rmId, vendorId])
        const existing = (existingRows as any[])[0]
        if (existing) {
          await applyVendorRateApproval(conn, userId, "RM_VRM", existing, v, today, rawMaterials.setVendorRateStatus)
        } else {
          const [vResult] = await conn.execute(rawMaterials.insertVendorRate, toRmVendorRateParams(rmId, v, today))
          const vrmId = (vResult as any).insertId
          await insertApprovalWithItems(conn, userId, "RM_VRM", vrmId, [
            ["curr_rate", v.curr_rate ? String(v.curr_rate) : ""],
            ["moq", v.moq ? String(v.moq) : ""],
            ["uom", v.rate_uom?.trim() || ""],
            ["effective_from", v.effective_from?.trim() || today],
          ])
        }
      }

      for (const m of mfgList) {
        const mfgId = m.mfg_id ? Number(m.mfg_id) : null
        const [existingRows] = await conn.execute(rawMaterials.checkMfgRate, [rmId, mfgId])
        const existing = (existingRows as any[])[0]
        if (existing) {
          await applyMfgRateApproval(conn, userId, "RM_RATE", existing, m, today, rawMaterials.setRateStatus)
        } else {
          const [mResult] = await conn.execute(rawMaterials.insertMfgRate, toRmMfgRateParams(rmId, m, today))
          const mrmId = (mResult as any).insertId
          await insertApprovalWithItems(conn, userId, "RM_RATE", mrmId, [
            ["curr_rate", m.curr_rate ? String(m.curr_rate) : ""],
            ["uom", m.rate_uom?.trim() || ""],
            ["effective_from", m.effective_from?.trim() || today],
          ])
        }
      }

      await conn.commit()
      recordProcessedEvent("RM_RATES", logCtx.eventId, { rmId })
      logger.info({ ...logCtx, rmId, message: "RM rates added in review" })
      return NextResponse.json({ rmId })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("RM_RATES", logCtx.eventId, { name: name.trim() }, err.message)
      logger.error({ ...logCtx, error: err.message, message: "Raw material add-rates transaction error" })
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  } catch (err: any) {
    logger.error({ ...ctx, error: err.message, message: "Raw material add-rates lookup error" })
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export async function rmBulk(body: any, userId: number, ctx: object): Promise<NextResponse> {
  const { rows } = body
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: "No rows provided" }, { status: 400 })

  const logCtx = { ...ctx, eventId: makeEventId("RM_BULK", "bulk"), module: "RM_Bulk" }
  logger.info({ ...logCtx, rowCount: rows.length, message: "RM Bulk Insert Started" })
  recordRawEvent("RM_BULK", logCtx.eventId, { rowCount: rows.length })

  const conn = await pool.getConnection()
  await conn.beginTransaction()
  let inserted = 0, skipped = 0
  try {
    for (const row of rows) {
      if (!row.name?.trim()) continue
      try {
        const [rmResult] = await conn.execute(rawMaterials.insert, await toRmParams(conn, row))
        const rmId = (rmResult as any).insertId
        await insertApprovalWithItems(conn, userId, "RM_MAT", rmId, [
          ["name", row.name.trim()],
          ["make", row.make?.trim() || ""],
          ["type", row.type?.trim() || ""],
          ["uom", row.uom?.trim() || ""],
          ["hsn_code", row.hsn_code?.trim() || ""],
          ["inci_name", row.inci_name?.trim() || ""],
        ])
        inserted++
      } catch (err: any) {
        if (err.code === "ER_DUP_ENTRY") { skipped++ } else { throw err }
      }
    }
    await conn.commit()
    recordProcessedEvent("RM_BULK", logCtx.eventId, { inserted, skipped })
    logger.info({ ...logCtx, inserted, skipped, message: "RM bulk completed" })
    return NextResponse.json({ inserted, skipped })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("RM_BULK", logCtx.eventId, { rowCount: rows.length }, err.message)
    logger.error({ ...logCtx, error: err.message, message: "Raw material bulk insert error" })
    return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function rmS3Bulk(body: any, userId: number, ctx: object): Promise<NextResponse> {
  const { key } = body
  if (!key?.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 })

  const logCtx = { ...ctx, eventId: makeEventId("RM_S3BULK", "bulk-s3"), module: "RM_S3Bulk" }
  logger.info({ ...logCtx, s3Key: key, message: "RM S3 Bulk Import Started" })
  recordRawEvent("RM_S3BULK", logCtx.eventId, { s3Key: key, rowCount: null })

  let rawRows: any[]
  try {
    rawRows = await parseS3Import(key)
  } catch (err: any) {
    recordFailedEvent("RM_S3BULK", logCtx.eventId, { s3Key: key }, err.message)
    logger.error({ ...logCtx, s3Key: key, error: err.message, message: "RM S3 bulk: failed to parse file" })
    return NextResponse.json({ error: "Failed to parse file: " + err.message }, { status: 400 })
  }

  if (rawRows.length === 0) {
    recordFailedEvent("RM_S3BULK", logCtx.eventId, { s3Key: key, rowCount: 0 }, "File is empty or has no data rows")
    logger.warn({ ...logCtx, s3Key: key, message: "RM S3 bulk: file empty or no data rows" })
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 })
  }

  const conn = await pool.getConnection()
  await conn.beginTransaction()
  let inserted = 0, skipped = 0
  try {
    for (const row of rawRows) {
      if (!row["name"]?.trim()) continue
      try {
        const [rmResult] = await conn.execute(rawMaterials.insert, await toRmParams(conn, row))
        const rmId = (rmResult as any).insertId
        await insertApprovalWithItems(conn, userId, "RM_MAT", rmId, [
          ["name", row["name"].trim()],
          ["make", row["make"]?.trim() || ""],
          ["type", row["type"]?.trim() || ""],
          ["uom", row["uom"]?.trim() || ""],
          ["hsn_code", row["hsn_code"]?.trim() || ""],
          ["inci_name", row["inci_name"]?.trim() || ""],
        ])
        inserted++
      } catch (err: any) {
        if (err.code === "ER_DUP_ENTRY") { skipped++ } else { throw err }
      }
    }
    await conn.commit()
    recordProcessedEvent("RM_S3BULK", logCtx.eventId, { s3Key: key, inserted, skipped })
    logger.info({ ...logCtx, inserted, skipped, message: "RM S3 bulk completed" })
    return NextResponse.json({ inserted, skipped })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("RM_S3BULK", logCtx.eventId, { s3Key: key }, err.message)
    logger.error({ ...logCtx, error: err.message, message: "Raw material S3 bulk error" })
    return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
