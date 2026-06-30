import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { execute, query, pool } from "@/lib/db"
import { rawMaterials } from "@/lib/queries/raw-materials"
import { approvalsSql } from "@/lib/queries/approvals"
import { parseS3Import } from "@/lib/import-s3"
import { recordRawEvent, recordProcessedEvent, recordFailedEvent } from "@/lib/events"
import logger from "@/lib/logger"

// Parameters for the rm table insert (base material).
function toRmParams(r: any, status: string = "in_review") {
  return [
    r.rm_code?.trim() || null,
    r.name.trim(),
    r.make?.trim() || null,
    r.type?.trim() || null,
    r.uom?.trim() || null,
    status,
    r.hsn_code?.trim() || null,
    r.inci_name?.trim() || null,
  ]
}

// Parameters for the rm_vrm (vendor rate) insert.
function toVendorRateParams(rmId: number, r: any, status: string = "in_review") {
  return [
    rmId,
    r.vendor_id ? Number(r.vendor_id) : null,
    r.vendor_code?.trim() || null,
    r.curr_rate ? Number(r.curr_rate) : 0,
    r.moq ? Number(r.moq) : null,
    r.rate_uom?.trim() || null,
    r.effective_from?.trim() || new Date().toISOString().slice(0, 10),
    r.effective_to?.trim() || null,
    status
  ]
}

// Parameters for the rm_mrm (manufacturer rate) insert.
function toMfgRateParams(rmId: number, r: any, status: string = "in_review") {
  return [
    rmId,
    r.mfg_id ? Number(r.mfg_id) : null,
    r.mfg_code?.trim() || null,
    r.curr_rate ? Number(r.curr_rate) : 0,
    r.rate_uom?.trim() || null,
    r.approved_vendor_id ? Number(r.approved_vendor_id) : null,
    r.approved_vendor_code?.trim() || null,
    r.effective_from?.trim() || new Date().toISOString().slice(0, 10),
    status
  ]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const body = await req.json()
  const { action } = body

  const ctx = { requestId: crypto.randomUUID(), userId, route: "/api/masters/raw-materials" }
  logger.info({ ...ctx, action, message: "Raw Materials API request received" })

  if (action === "create") {
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const logCtx = { ...ctx, eventId: `rm-new-${Date.now()}`, module: "RM_Create" }
    logger.info({ ...logCtx, name: body.name.trim(), message: "RM Create Started" })
    recordRawEvent("RM_MAT", logCtx.eventId, { name: body.name.trim() })

    const hasVendorRate = !!body.vendor_code?.trim()
    const hasMfgRate = !!body.mfg_code?.trim()

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [rmResult] = await conn.execute(rawMaterials.insert, toRmParams(body, "in_review"))
      const rmId = (rmResult as any).insertId

      const [arRm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_MAT", rmId])
      const approvalIdRm = (arRm as any).insertId

      const rmFields: [string, string][] = [
        ["name", body.name.trim()],
        ["make", body.make?.trim() || ""],
        ["type", body.type?.trim() || ""],
        ["uom", body.uom?.trim() || ""],
        ["hsn_code", body.hsn_code?.trim() || ""],
        ["inci_name", body.inci_name?.trim() || ""],
      ]
      for (const [field, newVal] of rmFields) {
        if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdRm, field, "", newVal])
      }

      if (hasVendorRate) {
        const [vResult] = await conn.execute(rawMaterials.insertVendorRate, toVendorRateParams(rmId, body, "in_review"))
        const vrmId = (vResult as any).insertId
        const [arVrm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_VRM", vrmId])
        const approvalIdVrm = (arVrm as any).insertId
        const vrmFields: [string, string][] = [
          ["curr_rate", body.curr_rate ? String(body.curr_rate) : ""],
          ["moq", body.moq ? String(body.moq) : ""],
          ["uom", body.rate_uom?.trim() || ""],
          ["effective_from", body.effective_from?.trim() || new Date().toISOString().slice(0, 10)],
        ]
        for (const [field, newVal] of vrmFields) {
          if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdVrm, field, "", newVal])
        }
      } else if (hasMfgRate) {
        const [mResult] = await conn.execute(rawMaterials.insertMfgRate, toMfgRateParams(rmId, body, "in_review"))
        const mrmId = (mResult as any).insertId
        const [arMrm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_RATE", mrmId])
        const approvalIdMrm = (arMrm as any).insertId
        const mrmFields: [string, string][] = [
          ["curr_rate", body.curr_rate ? String(body.curr_rate) : ""],
          ["uom", body.rate_uom?.trim() || ""],
          ["effective_from", body.effective_from?.trim() || new Date().toISOString().slice(0, 10)],
        ]
        for (const [field, newVal] of mrmFields) {
          if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdMrm, field, "", newVal])
        }
      }

      await conn.commit()
      recordProcessedEvent("RM_MAT", logCtx.eventId, { id: rmId })
      logger.info({ ...logCtx, rmId, message: "RM created in review" })
      return NextResponse.json({ id: rmId })
    } catch (err: any) {
      await conn.rollback()
      recordFailedEvent("RM_MAT", logCtx.eventId, { name: body.name.trim() }, err.message)
      logger.error({ ...logCtx, error: err.message, message: "Raw material create error" })
      if (err.code === "ER_DUP_ENTRY") {
        return NextResponse.json({ error: `RM code "${body.rm_code?.trim()}" already exists` }, { status: 409 })
      }
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  if (action === "check-RM") {
    const { name, make, inci_name } = body
    if (!inci_name?.trim() || !name?.trim() || !make) {
      return NextResponse.json({ error: "name, make, inci_name  are required" }, { status: 400 })
    }
    try {
      const rows = await query<{ id: number }>(rawMaterials.checkDuplicate, [
        name.trim(),
        make?.trim() || "",
        inci_name?.trim() || "",
      ])
      return NextResponse.json({ exists: rows.length > 0 })
    } catch (err: any) {
      logger.error({ ...ctx, error: err.message, message: "Raw material check error" })
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  if (action === "check-vendor") {
    const { name, make, inci_name, vendor_id } = body
    if (!name?.trim() || !vendor_id) {
      return NextResponse.json({ error: "name and vendor_id are required" }, { status: 400 })
    }
    try {
      const rms = await query<{ id: number }>(rawMaterials.checkDuplicate, [
        name.trim(),
        make?.trim() || "",
        inci_name?.trim() || "",
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

  if (action === "create-full") {
    const { rm } = body
    const vendorList = Array.isArray(body.vendors) ? body.vendors : []
    const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
    if (!rm?.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const logCtx = { ...ctx, eventId: `rm-create-full-${Date.now()}`, module: "RM_CreateFull" }
    logger.info({ ...logCtx, name: rm.name.trim(), vendors: vendorList.length, mfgs: mfgList.length, message: "RM Create-Full Started" })
    recordRawEvent("RM_FULL", logCtx.eventId, { name: rm.name.trim(), vendorCount: vendorList.length, mfgCount: mfgList.length })

    const today = new Date().toISOString().slice(0, 10)
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [rmResult] = await conn.execute(rawMaterials.insert, toRmParams(rm, "in_review"))
      const rmId = (rmResult as any).insertId

      const [arRm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_MAT", rmId])
      const approvalIdRm = (arRm as any).insertId

      const rmFields: [string, string][] = [
        ["name", rm.name.trim()],
        ["make", rm.make?.trim() || ""],
        ["type", rm.type?.trim() || ""],
        ["uom", rm.uom?.trim() || ""],
        ["hsn_code", rm.hsn_code?.trim() || ""],
        ["inci_name", rm.inci_name?.trim() || ""],
      ]
      for (const [field, newVal] of rmFields) {
        if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdRm, field, "", newVal])
      }

      for (const v of vendorList) {
        const vendorId = v.vendor_id ? Number(v.vendor_id) : null
        const [existingRows] = await conn.execute(rawMaterials.checkVendorRate, [rmId, vendorId])
        const existing = (existingRows as any[])[0]

        if (existing) {
          if (existing.status === "in_review") continue
          if (existing.status === "draft") {
            const [latestRejectionRows] = await conn.execute(approvalsSql.selectLatestRejection, ["RM_VRM", existing.id])
            const latestRejection = (latestRejectionRows as any[])[0]
            if (latestRejection && latestRejection.raised_by !== userId) continue
          }
          const [pendingRows] = await conn.execute(approvalsSql.hasPending, ["RM_VRM", existing.id])
          if ((pendingRows as any[])[0]?.cnt > 0) continue

          const vrmFields: [string, unknown, unknown][] = [
            ["curr_rate", existing.curr_rate, v.curr_rate],
            ["moq", existing.moq, v.moq],
            ["uom", existing.uom, v.rate_uom],
            ["effective_from", existing.effective_from, v.effective_from ?? today],
          ]
          const diff = vrmFields.filter(([, oldVal, newVal]) => String(oldVal ?? "") !== String(newVal ?? ""))
          if (diff.length === 0) continue

          const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_VRM", existing.id])
          const approvalId = (ar as any).insertId
          for (const [field, oldVal, newVal] of diff) {
            await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, String(oldVal ?? ""), String(newVal ?? "")])
          }
          await conn.execute(rawMaterials.setVendorRateStatus, ["in_review", existing.id])
        } else {
          const [vResult] = await conn.execute(rawMaterials.insertVendorRate, [
            rmId, vendorId, v.vendor_code?.trim() || null,
            v.curr_rate ? Number(v.curr_rate) : 0,
            v.moq ? Number(v.moq) : null,
            v.rate_uom?.trim() || null,
            today, null, "in_review"
          ])
          const vrmId = (vResult as any).insertId
          const [arVrm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_VRM", vrmId])
          const approvalIdVrm = (arVrm as any).insertId
          const vrmFields: [string, string][] = [
            ["curr_rate", v.curr_rate ? String(v.curr_rate) : ""],
            ["moq", v.moq ? String(v.moq) : ""],
            ["uom", v.rate_uom?.trim() || ""],
            ["effective_from", v.effective_from?.trim() || today],
          ]
          for (const [field, newVal] of vrmFields) {
            if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdVrm, field, "", newVal])
          }
        }
      }

      for (const m of mfgList) {
        const mfgId = m.mfg_id ? Number(m.mfg_id) : null
        const [existingMfgRows] = await conn.execute(rawMaterials.checkMfgRate, [rmId, mfgId])
        const existingMfg = (existingMfgRows as any[])[0]

        if (existingMfg) {
          if (existingMfg.status === "in_review") continue
          if (existingMfg.status === "draft") {
            const [latestRejectionRows] = await conn.execute(approvalsSql.selectLatestRejection, ["RM_RATE", existingMfg.id])
            const latestRejection = (latestRejectionRows as any[])[0]
            if (latestRejection && latestRejection.raised_by !== userId) continue
          }
          const [pendingRows] = await conn.execute(approvalsSql.hasPending, ["RM_RATE", existingMfg.id])
          if ((pendingRows as any[])[0]?.cnt > 0) continue

          const rateFields: [string, unknown, unknown][] = [
            ["curr_rate", existingMfg.curr_rate, m.curr_rate],
            ["uom", existingMfg.uom, m.rate_uom],
            ["effective_from", existingMfg.effective_from, m.effective_from ?? today],
          ]
          const diff = rateFields.filter(([, oldVal, newVal]) => String(oldVal ?? "") !== String(newVal ?? ""))
          if (diff.length === 0) continue

          const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_RATE", existingMfg.id])
          const approvalId = (ar as any).insertId
          for (const [field, oldVal, newVal] of diff) {
            await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, String(oldVal ?? ""), String(newVal ?? "")])
          }
          await conn.execute(rawMaterials.setRateStatus, ["in_review", existingMfg.id])
        } else {
          const [mResult] = await conn.execute(rawMaterials.insertMfgRate, [
            rmId, mfgId, m.mfg_code?.trim() || null,
            m.curr_rate ? Number(m.curr_rate) : 0,
            m.rate_uom?.trim() || null,
            null, null, today, "in_review"
          ])
          const mrmId = (mResult as any).insertId
          const [arMrm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_RATE", mrmId])
          const approvalIdMrm = (arMrm as any).insertId
          const mrmFields: [string, string][] = [
            ["curr_rate", m.curr_rate ? String(m.curr_rate) : ""],
            ["uom", m.rate_uom?.trim() || ""],
            ["effective_from", m.effective_from?.trim() || today],
          ]
          for (const [field, newVal] of mrmFields) {
            if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdMrm, field, "", newVal])
          }
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

  if (action === "add-rates") {
    const { name, make, inci_name } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    const vendorList = Array.isArray(body.vendors) ? body.vendors : []
    const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
    if (vendorList.length === 0 && mfgList.length === 0) {
      return NextResponse.json({ error: "Provide at least one vendor rate or manufacturer" }, { status: 400 })
    }

    const logCtx = { ...ctx, eventId: `rm-add-rates-${Date.now()}`, module: "RM_AddRates" }
    logger.info({ ...logCtx, name: name.trim(), message: "RM Add Rates Started" })
    recordRawEvent("RM_RATES", logCtx.eventId, { name: name.trim() })

    try {
      const rms = await query<{ id: number }>(rawMaterials.checkDuplicate, [
        name.trim(),
        make?.trim() || "",
        inci_name?.trim() || "",
      ])
      if (rms.length === 0) {
        return NextResponse.json({ error: "Material not found" }, { status: 404 })
      }
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
            if (existing.status === "in_review") continue
            if (existing.status === "draft") {
              const [latestRejectionRows] = await conn.execute(approvalsSql.selectLatestRejection, ["RM_VRM", existing.id])
              const latestRejection = (latestRejectionRows as any[])[0]
              if (latestRejection && latestRejection.raised_by !== userId) continue
            }
            const [pendingRows] = await conn.execute(approvalsSql.hasPending, ["RM_VRM", existing.id])
            if ((pendingRows as any[])[0]?.cnt > 0) continue

            const vrmFields: [string, unknown, unknown][] = [
              ["curr_rate", existing.curr_rate, v.curr_rate],
              ["moq", existing.moq, v.moq],
              ["uom", existing.uom, v.rate_uom],
              ["effective_from", existing.effective_from, v.effective_from ?? today],
            ]
            const diff = vrmFields.filter(([, oldVal, newVal]) => String(oldVal ?? "") !== String(newVal ?? ""))
            if (diff.length === 0) continue

            const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_VRM", existing.id])
            const approvalId = (ar as any).insertId
            for (const [field, oldVal, newVal] of diff) {
              await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, String(oldVal ?? ""), String(newVal ?? "")])
            }
            await conn.execute(rawMaterials.setVendorRateStatus, ["in_review", existing.id])
          } else {
            const [vResult] = await conn.execute(rawMaterials.insertVendorRate, [
              rmId, vendorId, v.vendor_code?.trim() || null,
              v.curr_rate ? Number(v.curr_rate) : 0,
              v.moq ? Number(v.moq) : null,
              v.rate_uom?.trim() || null,
              today, null, "in_review"
            ])
            const vrmId = (vResult as any).insertId
            const [arVrm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_VRM", vrmId])
            const approvalIdVrm = (arVrm as any).insertId
            const vrmFields: [string, string][] = [
              ["curr_rate", v.curr_rate ? String(v.curr_rate) : ""],
              ["moq", v.moq ? String(v.moq) : ""],
              ["uom", v.rate_uom?.trim() || ""],
              ["effective_from", v.effective_from?.trim() || today],
            ]
            for (const [field, newVal] of vrmFields) {
              if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdVrm, field, "", newVal])
            }
          }
        }
        for (const m of mfgList) {
          const mfgId = m.mfg_id ? Number(m.mfg_id) : null
          const [existingMfgRows] = await conn.execute(rawMaterials.checkMfgRate, [rmId, mfgId])
          const existingMfg = (existingMfgRows as any[])[0]

          if (existingMfg) {
            if (existingMfg.status === "in_review") continue
            if (existingMfg.status === "draft") {
              const [latestRejectionRows] = await conn.execute(approvalsSql.selectLatestRejection, ["RM_RATE", existingMfg.id])
              const latestRejection = (latestRejectionRows as any[])[0]
              if (latestRejection && latestRejection.raised_by !== userId) continue
            }
            const [pendingRows] = await conn.execute(approvalsSql.hasPending, ["RM_RATE", existingMfg.id])
            if ((pendingRows as any[])[0]?.cnt > 0) continue

            const rateFields: [string, unknown, unknown][] = [
              ["curr_rate", existingMfg.curr_rate, m.curr_rate],
              ["uom", existingMfg.uom, m.rate_uom],
              ["effective_from", existingMfg.effective_from, m.effective_from ?? today],
            ]
            const diff = rateFields.filter(([, oldVal, newVal]) => String(oldVal ?? "") !== String(newVal ?? ""))
            if (diff.length === 0) continue

            const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_RATE", existingMfg.id])
            const approvalId = (ar as any).insertId
            for (const [field, oldVal, newVal] of diff) {
              await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, String(oldVal ?? ""), String(newVal ?? "")])
            }
            await conn.execute(rawMaterials.setRateStatus, ["in_review", existingMfg.id])
          } else {
            const [mResult] = await conn.execute(rawMaterials.insertMfgRate, [
              rmId, mfgId, m.mfg_code?.trim() || null,
              m.curr_rate ? Number(m.curr_rate) : 0,
              m.rate_uom?.trim() || null,
              null, null, today, "in_review"
            ])
            const mrmId = (mResult as any).insertId
            const [arMrm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_RATE", mrmId])
            const approvalIdMrm = (arMrm as any).insertId
            const mrmFields: [string, string][] = [
              ["curr_rate", m.curr_rate ? String(m.curr_rate) : ""],
              ["uom", m.rate_uom?.trim() || ""],
              ["effective_from", m.effective_from?.trim() || today],
            ]
            for (const [field, newVal] of mrmFields) {
              if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdMrm, field, "", newVal])
            }
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

  if (action === "bulk") {
    const { rows } = body
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }

    const logCtx = { ...ctx, eventId: `rm-bulk-${Date.now()}`, module: "RM_Bulk" }
    logger.info({ ...logCtx, rowCount: rows.length, message: "RM Bulk Insert Started" })
    recordRawEvent("RM_BULK", logCtx.eventId, { rowCount: rows.length })

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rows) {
        if (!row.name?.trim()) continue
        try {
          const [rmResult] = await conn.execute(rawMaterials.insert, toRmParams(row, "in_review"))
          const rmId = (rmResult as any).insertId

          const [arRm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_MAT", rmId])
          const approvalIdRm = (arRm as any).insertId

          const rmFields: [string, string][] = [
            ["name", row.name.trim()],
            ["make", row.make?.trim() || ""],
            ["type", row.type?.trim() || ""],
            ["uom", row.uom?.trim() || ""],
            ["hsn_code", row.hsn_code?.trim() || ""],
            ["inci_name", row.inci_name?.trim() || ""],
          ]
          for (const [field, newVal] of rmFields) {
            if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdRm, field, "", newVal])
          }
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") {
            skipped++
          } else {
            throw err
          }
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

  if (action === "bulk_from_s3") {
    const { key } = body
    if (!key?.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 })

    const logCtx = { ...ctx, eventId: `rm-s3bulk-${Date.now()}`, module: "RM_S3Bulk" }
    logger.info({ ...logCtx, s3Key: key, message: "RM S3 Bulk Import Started" })
    recordRawEvent("RM_S3BULK", logCtx.eventId, { s3Key: key, rowCount: null })

    let rawRows
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
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rawRows) {
        if (!row["name"]?.trim()) continue
        try {
          const [rmResult] = await conn.execute(rawMaterials.insert, toRmParams(row, "in_review"))
          const rmId = (rmResult as any).insertId

          const [arRm] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_MAT", rmId])
          const approvalIdRm = (arRm as any).insertId

          const rmFields: [string, string][] = [
            ["name", row["name"].trim()],
            ["make", row["make"]?.trim() || ""],
            ["type", row["type"]?.trim() || ""],
            ["uom", row["uom"]?.trim() || ""],
            ["hsn_code", row["hsn_code"]?.trim() || ""],
            ["inci_name", row["inci_name"]?.trim() || ""],
          ]
          for (const [field, newVal] of rmFields) {
            if (newVal) await conn.execute(approvalsSql.insertApprovalItem, [approvalIdRm, field, "", newVal])
          }
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

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
