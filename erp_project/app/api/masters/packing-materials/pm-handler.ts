import { NextResponse } from "next/server"
import { query, pool } from "@/lib/db"
import { packingMaterials } from "@/lib/queries/packing-materials"
import { parseS3Import } from "@/lib/import-s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent, makeEventId } from "@/lib/events"
import logger from "@/lib/logger"
import { insertApprovalWithItems, applyVendorRateApproval, applyMfgRateApproval } from "@/lib/master-routes/material-utils"

function toPmParams(r: any, status = "in_review"): any[] {
  return [
    r.pm_code?.trim() || null, r.name.trim(),
    r.type?.trim() || null, r.hsn_code?.trim() || null,
    r.uom?.trim() || null, status,
    r.pantone_color?.trim() || null,
  ]
}

function toPmMfgRateParams(pmId: number, m: any, today: string): any[] {
  return [
    pmId, m.mfg_id ? Number(m.mfg_id) : null,
    m.mfg_code?.trim() || null,
    m.curr_rate ? Number(m.curr_rate) : 0,
    m.rate_uom?.trim() || null, "in_review",
    m.effective_from?.trim() || today,
  ]
}

export async function pmCreate(body: any, userId: number, ctx: object): Promise<NextResponse> {
  if (!body.name?.trim()) {
    logger.warn({ ...ctx, message: "PM create rejected: missing name" })
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  const eventId = makeEventId("PM", "create")
  const hasVendorRate = !!body.vendor_code?.trim()
  const hasMfgRate = !!body.mfg_code?.trim()
  const rateTab = hasVendorRate ? "vendor" : hasMfgRate ? "manufacturer" : "none"
  const logCtx = { ...ctx, eventId, rateTab }
  logger.info({ ...logCtx, message: "PM create started", name: body.name.trim(), pm_code: body.pm_code?.trim() })
  recordRawEvent("PM", eventId, { name: body.name.trim(), pm_code: body.pm_code?.trim() || null })

  if (hasVendorRate || hasMfgRate) {
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [pmResult] = await conn.execute(packingMaterials.insert, toPmParams(body))
      const pmId = (pmResult as any).insertId
      await insertApprovalWithItems(conn, userId, "PM_MAT", pmId, [
        ["name", body.name.trim()],
        ["type", body.type?.trim() || ""],
        ["uom", body.uom?.trim() || ""],
        ["hsn_code", body.hsn_code?.trim() || ""],
      ])
      if (hasVendorRate) {
        await conn.execute(packingMaterials.insertVendorRate, [
          pmId, body.vendor_id ? Number(body.vendor_id) : null,
          body.vendor_code?.trim() || null,
          body.curr_rate ? Number(body.curr_rate) : null,
          body.moq ? Number(body.moq) : null,
          body.rate_uom?.trim() || null,
          body.rate_status || "active",
          body.effective_from?.trim() || null,
          body.effective_to?.trim() || null,
        ])
        logger.info({ ...logCtx, message: "Vendor rate tab: rate inserted", pmId, vendor_code: body.vendor_code?.trim() })
      } else {
        await conn.execute(packingMaterials.insertMfgRate, [
          pmId, body.mfg_id ? Number(body.mfg_id) : null,
          body.mfg_code?.trim() || null,
          body.curr_rate ? Number(body.curr_rate) : null,
          body.rate_uom?.trim() || null,
          body.rate_status || "active",
          body.effective_from?.trim() || null,
        ])
        logger.info({ ...logCtx, message: "Manufacturer tab: rate inserted", pmId, mfg_code: body.mfg_code?.trim() })
      }
      await conn.commit()
      recordProcessedEvent("PM", eventId, { pmId })
      logger.info({ ...logCtx, message: "PM + rate transaction committed", pmId })
      return NextResponse.json({ id: pmId })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("PM", eventId, { name: body.name.trim() }, err.message)
      logger.error({ ...logCtx, message: `PM + rate insert error (${rateTab} tab)`, error: err.message, code: err.code })
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  const conn = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const [pmResult] = await conn.execute(packingMaterials.insert, toPmParams(body))
    const pmId = (pmResult as any).insertId
    await insertApprovalWithItems(conn, userId, "PM_MAT", pmId, [
      ["name", body.name.trim()],
      ["type", body.type?.trim() || ""],
      ["uom", body.uom?.trim() || ""],
      ["hsn_code", body.hsn_code?.trim() || ""],
    ])
    await conn.commit()
    recordProcessedEvent("PM", eventId, { pmId })
    logger.info({ ...logCtx, message: "PM create succeeded (no rate)", pmId })
    return NextResponse.json({ id: pmId })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("PM", eventId, { name: body.name.trim() }, err.message)
    if (err.code === "ER_DUP_ENTRY") {
      logger.warn({ ...logCtx, message: "PM create rejected: duplicate pm_code", pm_code: body.pm_code?.trim() })
      return NextResponse.json({ error: `PM code "${body.pm_code?.trim()}" already exists` }, { status: 409 })
    }
    logger.error({ ...logCtx, message: "PM create error", error: err.message, code: err.code })
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function pmCheckDuplicate(body: any, ctx: object): Promise<NextResponse> {
  const { name, type } = body
  const logCtx = { ...ctx, action: "check-PM" }
  if (!name?.trim() || !type?.trim()) {
    logger.warn({ ...logCtx, message: "check-PM rejected: missing name or type" })
    return NextResponse.json({ error: "name and type are required" }, { status: 400 })
  }
  try {
    const rows = await query<{ id: number }>(packingMaterials.checkDuplicate, [name.trim(), type.trim()])
    logger.info({ ...logCtx, message: "check-PM completed", name: name.trim(), type: type.trim(), exists: rows.length > 0 })
    return NextResponse.json({ exists: rows.length > 0 })
  } catch (err: any) {
    logger.error({ ...logCtx, message: "check-PM error", error: err.message, code: err.code })
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export async function pmCheckVendor(body: any, ctx: object): Promise<NextResponse> {
  const { name, type, vendor_id } = body
  const logCtx = { ...ctx, action: "check-vendor" }
  if (!name?.trim() || !vendor_id) {
    logger.warn({ ...logCtx, message: "check-vendor rejected: missing name or vendor_id" })
    return NextResponse.json({ error: "name and vendor_id are required" }, { status: 400 })
  }
  try {
    const pms = await query<{ id: number }>(packingMaterials.checkDuplicate, [name.trim(), type?.trim() || ""])
    if (pms.length === 0) return NextResponse.json({ exists: false })
    const rates = await query<any>(packingMaterials.checkVendorRate, [pms[0].id, Number(vendor_id)])
    if (rates.length === 0) return NextResponse.json({ exists: false })
    const r = rates[0]
    logger.info({ ...logCtx, message: "check-vendor: existing rate found", pmId: pms[0].id, vendor_id: Number(vendor_id) })
    return NextResponse.json({ exists: true, existing: { curr_rate: r.curr_rate, moq: r.moq, uom: r.uom } })
  } catch (err: any) {
    logger.error({ ...logCtx, message: "check-vendor error", error: err.message, code: err.code })
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export async function pmCreateFull(body: any, userId: number, ctx: object): Promise<NextResponse> {
  const { pm } = body
  const vendorList = Array.isArray(body.vendors) ? body.vendors : []
  const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
  const eventId = makeEventId("PM_FULL", "create-full")
  const logCtx = { ...ctx, action: "create-full", eventId }

  if (!pm?.name?.trim()) {
    logger.warn({ ...logCtx, message: "create-full rejected: missing name" })
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  logger.info({ ...logCtx, message: "create-full started", name: pm.name.trim(), vendorCount: vendorList.length, mfgCount: mfgList.length })
  recordRawEvent("PM_FULL", eventId, { name: pm.name.trim(), vendorCount: vendorList.length, mfgCount: mfgList.length })

  const today = new Date().toISOString().slice(0, 10)
  const conn = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const [pmResult] = await conn.execute(packingMaterials.insert, [
      null, pm.name.trim(), pm.type?.trim() || null,
      pm.hsn_code?.trim() || null, pm.uom?.trim() || null, "in_review",
      pm.pantone_color?.trim() || null,
    ])
    const pmId = (pmResult as any).insertId
    logger.info({ ...logCtx, message: "create-full: PM inserted", pmId })
    await insertApprovalWithItems(conn, userId, "PM_MAT", pmId, [
      ["name", pm.name.trim()],
      ["type", pm.type?.trim() || ""],
      ["uom", pm.uom?.trim() || ""],
      ["hsn_code", pm.hsn_code?.trim() || ""],
    ])

    for (const v of vendorList) {
      const vendorId = v.vendor_id ? Number(v.vendor_id) : null
      const [existingRows] = await conn.execute(packingMaterials.checkVendorRate, [pmId, vendorId])
      const existing = (existingRows as any[])[0]
      if (existing) {
        await conn.execute(packingMaterials.archiveVendorRate, [
          pmId, existing.vendor_id, existing.curr_rate, existing.moq,
          existing.uom, existing.effective_from, existing.effective_to, existing.status,
        ])
        await conn.execute(packingMaterials.updateVendorRate, [
          v.curr_rate ? Number(v.curr_rate) : null,
          v.moq ? Number(v.moq) : null,
          v.rate_uom?.trim() || null, "active", today, existing.id,
        ])
        logger.info({ ...logCtx, message: "create-full: vendor rate archived + updated", pmId, vendor_id: vendorId })
      } else {
        await conn.execute(packingMaterials.insertVendorRate, [
          pmId, vendorId, v.vendor_code?.trim() || null,
          v.curr_rate ? Number(v.curr_rate) : null,
          v.moq ? Number(v.moq) : null,
          v.rate_uom?.trim() || null, "active", today, null,
        ])
        logger.info({ ...logCtx, message: "create-full: vendor rate inserted", pmId, vendor_id: vendorId })
      }
    }

    for (const m of mfgList) {
      const mfgId = m.mfg_id ? Number(m.mfg_id) : null
      const [existingRows] = await conn.execute(packingMaterials.checkMfgRate, [pmId, mfgId])
      const existing = (existingRows as any[])[0]
      if (existing) {
        await applyMfgRateApproval(conn, userId, "PM_RATE", existing, m, today, packingMaterials.setRateStatus)
        logger.info({ ...logCtx, message: "create-full: mfg rate approval submitted", pmId, mfg_id: mfgId })
      } else {
        const [mResult] = await conn.execute(packingMaterials.insertMfgRate, toPmMfgRateParams(pmId, m, today))
        const mrmId = (mResult as any).insertId
        await insertApprovalWithItems(conn, userId, "PM_RATE", mrmId, [
          ["curr_rate", m.curr_rate ? String(m.curr_rate) : ""],
          ["uom", m.rate_uom?.trim() || ""],
          ["effective_from", m.effective_from?.trim() || today],
        ])
        logger.info({ ...logCtx, message: "create-full: mfg rate in_review", pmId, mfg_id: mfgId })
      }
    }

    await conn.commit()
    recordProcessedEvent("PM_FULL", eventId, { pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })
    logger.info({ ...logCtx, message: "create-full committed", pmId })
    return NextResponse.json({ id: pmId })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("PM_FULL", eventId, { name: pm.name.trim() }, err.message)
    logger.error({ ...logCtx, message: "create-full error", error: err.message, code: err.code })
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function pmAddRates(body: any, userId: number, ctx: object): Promise<NextResponse> {
  const { name, type, pm_id } = body
  const vendorList = Array.isArray(body.vendors) ? body.vendors : []
  const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
  const eventId = makeEventId("PM_RATES", "add-rates", pm_id)
  const logCtx = { ...ctx, action: "add-rates", eventId }

  if (vendorList.length === 0 && mfgList.length === 0) {
    logger.warn({ ...logCtx, message: "add-rates rejected: no vendors or manufacturers provided" })
    return NextResponse.json({ error: "Provide at least one vendor rate or manufacturer" }, { status: 400 })
  }

  try {
    let pmId: number
    if (pm_id) {
      pmId = Number(pm_id)
    } else {
      if (!name?.trim()) {
        logger.warn({ ...logCtx, message: "add-rates rejected: missing name (no pm_id given)" })
        return NextResponse.json({ error: "name is required" }, { status: 400 })
      }
      const pms = await query<{ id: number }>(packingMaterials.checkDuplicate, [name.trim(), type?.trim() || ""])
      if (pms.length === 0) {
        logger.warn({ ...logCtx, message: "add-rates: material not found", name: name.trim() })
        return NextResponse.json({ error: "Material not found" }, { status: 404 })
      }
      pmId = pms[0].id
    }

    logger.info({ ...logCtx, message: "add-rates started", pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })
    recordRawEvent("PM_RATES", eventId, { pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })

    const today = new Date().toISOString().slice(0, 10)
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      for (const v of vendorList) {
        const vendorId = v.vendor_id ? Number(v.vendor_id) : null
        const [existingRows] = await conn.execute(packingMaterials.checkVendorRate, [pmId, vendorId])
        const existing = (existingRows as any[])[0]
        if (existing) {
          await applyVendorRateApproval(conn, userId, "PM_VRM", existing, v, today, packingMaterials.setVendorRateStatus)
        } else {
          await conn.execute(packingMaterials.insertVendorRate, [
            pmId, vendorId, v.vendor_code?.trim() || null,
            v.curr_rate ? Number(v.curr_rate) : null,
            v.moq ? Number(v.moq) : null,
            v.rate_uom?.trim() || null, "active", today, null,
          ])
          logger.info({ ...logCtx, message: "vendor rate inserted (new)", pmId, vendor_id: vendorId })
        }
      }

      for (const m of mfgList) {
        const mfgId = m.mfg_id ? Number(m.mfg_id) : null
        const [existingRows] = await conn.execute(packingMaterials.checkMfgRate, [pmId, mfgId])
        const existing = (existingRows as any[])[0]
        if (existing) {
          await applyMfgRateApproval(conn, userId, "PM_RATE", existing, m, today, packingMaterials.setRateStatus)
        } else {
          const [mResult] = await conn.execute(packingMaterials.insertMfgRate, toPmMfgRateParams(pmId, m, today))
          const mrmId = (mResult as any).insertId
          await insertApprovalWithItems(conn, userId, "PM_RATE", mrmId, [
            ["curr_rate", m.curr_rate ? String(m.curr_rate) : ""],
            ["uom", m.rate_uom?.trim() || ""],
            ["effective_from", m.effective_from?.trim() || today],
          ])
          logger.info({ ...logCtx, message: "mfg rate in_review (new)", pmId, mfg_id: mfgId })
        }
      }

      await conn.commit()
      recordProcessedEvent("PM_RATES", eventId, { pmId, vendorCount: vendorList.length, mfgCount: mfgList.length })
      logger.info({ ...logCtx, message: "add-rates committed", pmId })
      return NextResponse.json({ pmId })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("PM_RATES", eventId, { pmId }, err.message)
      logger.error({ ...logCtx, message: "add-rates transaction error", pmId, error: err.message, code: err.code })
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  } catch (err: any) {
    logger.error({ ...logCtx, message: "add-rates lookup error", error: err.message, code: err.code })
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export async function pmBulk(body: any, userId: number, ctx: object): Promise<NextResponse> {
  const { rows } = body
  const eventId = makeEventId("PM_BULK", "bulk")
  const logCtx = { ...ctx, action: "bulk", eventId }

  if (!Array.isArray(rows) || rows.length === 0) {
    logger.warn({ ...logCtx, message: "Bulk insert rejected: no rows provided" })
    return NextResponse.json({ error: "No rows provided" }, { status: 400 })
  }

  logger.info({ ...logCtx, message: "Bulk insert started", rowCount: rows.length })
  recordRawEvent("PM_BULK", eventId, { source: "csv", rowCount: rows.length })

  const conn = await pool.getConnection()
  await conn.beginTransaction()
  let inserted = 0, skipped = 0, invalid = 0
  try {
    for (const [index, row] of rows.entries()) {
      if (!row.name?.trim()) {
        invalid++
        logger.warn({ ...logCtx, message: "Bulk row skipped: missing name", rowIndex: index })
        continue
      }
      try {
        const [pmResult] = await conn.execute(packingMaterials.insert, toPmParams(row))
        const pmId = (pmResult as any).insertId
        await insertApprovalWithItems(conn, userId, "PM_MAT", pmId, [
          ["name", row.name.trim()],
          ["type", row.type?.trim() || ""],
          ["uom", row.uom?.trim() || ""],
          ["hsn_code", row.hsn_code?.trim() || ""],
        ])
        inserted++
      } catch (err: any) {
        if (err.code === "ER_DUP_ENTRY") {
          skipped++
          logger.info({ ...logCtx, message: "Bulk row skipped: duplicate", rowIndex: index, name: row.name?.trim() })
        } else {
          throw err
        }
      }
    }
    await conn.commit()
    recordProcessedEvent("PM_BULK", eventId, { source: "csv", inserted, skipped })
    logger.info({ ...logCtx, message: "Bulk insert committed", rowCount: rows.length, inserted, skipped, invalid })
    return NextResponse.json({ inserted, skipped })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("PM_BULK", eventId, { source: "csv", rowCount: rows.length }, err.message)
    logger.error({ ...logCtx, message: "Bulk insert error", error: err.message, code: err.code, inserted, skipped })
    return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function pmS3Bulk(body: any, userId: number, ctx: object): Promise<NextResponse> {
  const { key } = body
  const eventId = makeEventId("PM_S3BULK", "bulk-s3")
  const logCtx = { ...ctx, action: "bulk_from_s3", eventId, s3Key: key?.trim() }

  if (!key?.trim()) {
    logger.warn({ ...logCtx, message: "bulk_from_s3 rejected: missing key" })
    return NextResponse.json({ error: "key is required" }, { status: 400 })
  }
  recordRawEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key, rowCount: null })

  let rawRows: any[]
  try {
    rawRows = await parseS3Import(key)
  } catch (err: any) {
    recordFailedEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key }, err.message)
    logger.error({ ...logCtx, message: "bulk_from_s3: failed to parse file", error: err.message })
    return NextResponse.json({ error: "Failed to parse file: " + err.message }, { status: 400 })
  }

  if (rawRows.length === 0) {
    recordFailedEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key, rowCount: 0 }, "File is empty or has no data rows")
    logger.warn({ ...logCtx, message: "bulk_from_s3: file empty or no data rows" })
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 })
  }

  logger.info({ ...logCtx, message: "bulk_from_s3 started", rowCount: rawRows.length })
  const conn = await pool.getConnection()
  await conn.beginTransaction()
  let inserted = 0, skipped = 0, invalid = 0
  try {
    for (const [index, row] of rawRows.entries()) {
      if (!row["name"]?.trim()) {
        invalid++
        logger.warn({ ...logCtx, message: "bulk_from_s3 row skipped: missing name", rowIndex: index })
        continue
      }
      try {
        const [pmResult] = await conn.execute(packingMaterials.insert, toPmParams(row))
        const pmId = (pmResult as any).insertId
        await insertApprovalWithItems(conn, userId, "PM_MAT", pmId, [
          ["name", row["name"].trim()],
          ["type", row["type"]?.trim() || ""],
          ["uom", row["uom"]?.trim() || ""],
          ["hsn_code", row["hsn_code"]?.trim() || ""],
        ])
        inserted++
      } catch (err: any) {
        if (err.code === "ER_DUP_ENTRY") {
          skipped++
          logger.info({ ...logCtx, message: "bulk_from_s3 row skipped: duplicate", rowIndex: index, name: row["name"]?.trim() })
        } else {
          throw err
        }
      }
    }
    await conn.commit()
    recordProcessedEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key, inserted, skipped })
    logger.info({ ...logCtx, message: "bulk_from_s3 committed", rowCount: rawRows.length, inserted, skipped, invalid })
    return NextResponse.json({ inserted, skipped })
  } catch (err: any) {
    await conn.rollback()
    recordFailedEvent("PM_S3BULK", eventId, { source: "s3", s3Key: key }, err.message)
    logger.error({ ...logCtx, message: "bulk_from_s3 import failed", error: err.message, code: err.code, inserted, skipped })
    return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 })
  } finally {
    conn.release()
  }
}
