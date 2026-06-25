import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { execute, query, pool } from "@/lib/db"
import { rawMaterials } from "@/lib/queries/raw-materials"
import { approvalsSql } from "@/lib/queries/approvals"
import { parseS3Import } from "@/lib/import-s3"

// Parameters for the rm table insert (base material).
function toRmParams(r: any) {
  return [
    r.rm_code?.trim() || null,
    r.name.trim(),
    r.make?.trim() || null,
    r.type?.trim() || null,
    r.uom?.trim() || null,
    r.status || "active",
    r.hsn_code?.trim() || null,
    r.inci_name?.trim() || null,
  ]
}

// Parameters for the rm_vrm (vendor rate) insert.
function toVendorRateParams(rmId: number, r: any) {
  return [
    rmId,
    r.vendor_id ? Number(r.vendor_id) : null,
    r.vendor_code?.trim() || null,
    r.curr_rate ? Number(r.curr_rate) : null,
    r.moq ? Number(r.moq) : null,
    r.rate_uom?.trim() || null,
    r.effective_from?.trim() || null,
    r.effective_to?.trim() || null,
  ]
}

// Parameters for the rm_mrm (manufacturer rate) insert.
function toMfgRateParams(rmId: number, r: any) {
  return [
    rmId,
    r.mfg_id ? Number(r.mfg_id) : null,
    r.mfg_code?.trim() || null,
    r.curr_rate ? Number(r.curr_rate) : null,
    r.rate_uom?.trim() || null,
    r.approved_vendor_id ? Number(r.approved_vendor_id) : null,
    r.approved_vendor_code?.trim() || null,
    r.effective_from?.trim() || null,
  ]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body

  if (action === "create") {
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const hasVendorRate = !!body.vendor_code?.trim()
    const hasMfgRate = !!body.mfg_code?.trim()
    
    if (hasVendorRate || hasMfgRate) {
      // Transactional insert: rm + rate master table.
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        const [rmResult] = await conn.execute(rawMaterials.insert, toRmParams(body))
        const rmId = (rmResult as any).insertId

        if (hasVendorRate) {
          await conn.execute(rawMaterials.insertVendorRate, toVendorRateParams(rmId, body))
        } else {
          await conn.execute(rawMaterials.insertMfgRate, toMfgRateParams(rmId, body))
        }

        await conn.commit()
        return NextResponse.json({ id: rmId })
      } catch (err: any) {
        await conn.rollback()
        console.error("Raw material + rate insert error:", err)
        return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
      } finally {
        conn.release()
      }
    }

    // No rate data — insert rm only (existing behaviour).
    try {
      const result = await execute(rawMaterials.insert, toRmParams(body))
      return NextResponse.json({ id: result.insertId })
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: `RM code "${body.rm_code?.trim()}" already exists` },
          { status: 409 }
        )
      }
      console.error("Raw material create error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  if (action === "check-RM") {
    const { name, make, inci_name } = body
    // console.log("Inside route.ts: " , name ,make , inci_name);
    if (!inci_name?.trim() || !name?.trim() || !make ) {
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
      console.error("Raw material check error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }


  }

  // Wizard step 2: check if a vendor already has a rate for this material.
  // Body: { name, make, inci_name, vendor_id }
  // Returns: { exists: false } | { exists: true, existing: { curr_rate, moq, uom, effective_from } }
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
      console.error("Vendor rate check error:", err)
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

    const today = new Date().toISOString().slice(0, 10)
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [rmResult] = await conn.execute(rawMaterials.insert, [
        null,
        rm.name.trim(),
        rm.make?.trim() || null,
        rm.type?.trim() || null,
        rm.uom?.trim() || null,
        rm.status || "active",
        rm.hsn_code?.trim() || null,
        rm.inci_name?.trim() || null,
      ])
      const rmId = (rmResult as any).insertId

      for (const v of vendorList) {
        const vendorId = v.vendor_id ? Number(v.vendor_id) : null

        // Upsert: archive old rate to vrm_history if one exists, then update; else insert.
        const [existingRows] = await conn.execute(rawMaterials.checkVendorRate, [rmId, vendorId])
        const existing = (existingRows as any[])[0]

        if (existing) {
          await conn.execute(rawMaterials.archiveVendorRate, [
            rmId,
            existing.vendor_id,
            existing.curr_rate,
            existing.moq,
            existing.uom,
            existing.effective_from,
            existing.effective_to,
            existing.status,
          ])
          await conn.execute(rawMaterials.archiveToHistoryVrm, [
            rmId, existing.vendor_id, existing.curr_rate,
            existing.effective_from, existing.effective_to, existing.status,
          ])
          await conn.execute(rawMaterials.updateVendorRate, [
            v.curr_rate ? Number(v.curr_rate) : null,
            v.moq ? Number(v.moq) : null,
            v.rate_uom?.trim() || null,
            today,
            existing.id,
          ])
        } else {
          await conn.execute(rawMaterials.insertVendorRate, [
            rmId,
            vendorId,
            v.vendor_code?.trim() || null,
            v.curr_rate ? Number(v.curr_rate) : null,
            v.moq ? Number(v.moq) : null,
            v.rate_uom?.trim() || null,
            today,
            null,
          ])
        }
      }

      for (const m of mfgList) {
        const mfgId = m.mfg_id ? Number(m.mfg_id) : null
        const [existingMfgRows] = await conn.execute(rawMaterials.checkMfgRate, [rmId, mfgId])
        const existingMfg = (existingMfgRows as any[])[0]

        if (existingMfg) {
          let historyVendorId = existingMfg.approved_vendor_id
          if (!historyVendorId) {
            const [vRows] = await conn.execute(rawMaterials.getVendorId, [rmId])
            historyVendorId = (vRows as any[])[0]?.vendor_id ?? 0
          }
          await conn.execute(rawMaterials.archiveToHistoryMrm, [
            existingMfg.mfg_id, rmId, historyVendorId,
            existingMfg.curr_rate, existingMfg.effective_from, null,
            existingMfg.status === "active" ? 1 : 0,
          ])
          await conn.execute(rawMaterials.updateMfgRate, [
            m.curr_rate ? Number(m.curr_rate) : existingMfg.curr_rate,
            m.rate_uom?.trim() || existingMfg.uom,
            today,
            existingMfg.id,
          ])
        } else {
          await conn.execute(rawMaterials.insertMfgApproval, [
            rmId,
            mfgId,
            m.mfg_code?.trim() || null,
          ])
        }
      }

      await conn.commit()
      return NextResponse.json({ id: rmId })
    } catch (err: any) {
      await conn.rollback()
      console.error("Raw material create-full error:", err)
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  // Add vendor rates and/or mfg approvals to an EXISTING RM (no new rm row inserted).
  // Body: { name, make, inci_name, vendors: [...], manufacturers: [...] }
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
      const userId = parseInt(session.user.id)
      try {
        for (const v of vendorList) {
          const vendorId = v.vendor_id ? Number(v.vendor_id) : null
          const [existingRows] = await conn.execute(rawMaterials.checkVendorRate, [rmId, vendorId])
          const existing = (existingRows as any[])[0]
          if (existing) {
            // Skip if already locked for approval.
            if (existing.status === "in_review") continue

            // For draft rows, only the original submitter may re-edit.
            if (existing.status === "draft") {
              const [latestRejection] = await query<{ raised_by: number }>(
                approvalsSql.selectLatestRejection, ["RM_VRM", existing.id]
              )
              if (latestRejection && latestRejection.raised_by !== userId) continue
            }

            const pending = await query(approvalsSql.hasPending, ["RM_VRM", existing.id])
            if (pending.length > 0) continue

            const vrmFields: [string, unknown, unknown][] = [
              ["curr_rate",      existing.curr_rate,      v.curr_rate],
              ["moq",            existing.moq,            v.moq],
              ["uom",            existing.uom,            v.rate_uom],
              ["effective_from", existing.effective_from, v.effective_from ?? today],
            ]
            const diff = vrmFields.filter(([, oldVal, newVal]) =>
              String(oldVal ?? "") !== String(newVal ?? "")
            )
            if (diff.length === 0) continue

            const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_VRM", existing.id])
            const approvalId = (ar as any).insertId
            for (const [field, oldVal, newVal] of diff) {
              await conn.execute(approvalsSql.insertApprovalItem, [
                approvalId, field, String(oldVal ?? ""), String(newVal ?? ""),
              ])
            }
            await conn.execute(rawMaterials.setVendorRateStatus, ["in_review", existing.id])
          } else {
            await conn.execute(rawMaterials.insertVendorRate, [
              rmId, vendorId, v.vendor_code?.trim() || null,
              v.curr_rate ? Number(v.curr_rate) : null,
              v.moq ? Number(v.moq) : null,
              v.rate_uom?.trim() || null,
              today, null,
            ])
          }
        }
        for (const m of mfgList) {
          const mfgId = m.mfg_id ? Number(m.mfg_id) : null
          const [existingMfgRows] = await conn.execute(rawMaterials.checkMfgRate, [rmId, mfgId])
          const existingMfg = (existingMfgRows as any[])[0]

          if (existingMfg) {
            // Skip if the rate row is already in_review (pending approval).
            if (existingMfg.status === "in_review") continue

            // For draft rows, only the original submitter may re-edit.
            if (existingMfg.status === "draft") {
              const [latestRejection] = await query<{ raised_by: number }>(
                approvalsSql.selectLatestRejection, ["RM_RATE", existingMfg.id]
              )
              if (latestRejection && latestRejection.raised_by !== userId) continue
            }

            // Check for a pending approval against this rate row.
            const pending = await query(approvalsSql.hasPending, ["RM_RATE", existingMfg.id])
            if (pending.length > 0) continue

            // Compute field-level diff for rate fields.
            const rateFields: [string, unknown, unknown][] = [
              ["curr_rate",      existingMfg.curr_rate,      m.curr_rate],
              ["uom",            existingMfg.uom,            m.rate_uom],
              ["effective_from", existingMfg.effective_from, m.effective_from ?? today],
            ]
            const diff = rateFields.filter(([, oldVal, newVal]) =>
              String(oldVal ?? "") !== String(newVal ?? "")
            )
            if (diff.length === 0) continue

            // Create the approval record.
            const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_RATE", existingMfg.id])
            const approvalId = (ar as any).insertId
            for (const [field, oldVal, newVal] of diff) {
              await conn.execute(approvalsSql.insertApprovalItem, [
                approvalId, field, String(oldVal ?? ""), String(newVal ?? ""),
              ])
            }

            // Lock the rate row.
            await conn.execute(rawMaterials.setRateStatus, ["in_review", existingMfg.id])
          } else {
            await conn.execute(rawMaterials.insertMfgApproval, [
              rmId,
              mfgId,
              m.mfg_code?.trim() || null,
            ])
          }
        }
        await conn.commit()
        return NextResponse.json({ rmId })
      } catch (err: any) {
        await conn.rollback()
        console.error("Raw material add-rates error:", err)
        return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
      } finally {
        conn.release()
      }
    } catch (err: any) {
      console.error("Raw material add-rates lookup error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  if (action === "bulk") {
    const { rows } = body
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0

    try {
      for (const row of rows) {
        if (!row.name?.trim()) continue
        try {
          await conn.execute(rawMaterials.insert, toRmParams(row))
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
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      console.error("Raw material bulk insert error:", err)
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  if (action === "bulk_from_s3") {
    const { key } = body
    if (!key?.trim()) return NextResponse.json({ error: "key is required" }, { status: 400 })

    let rawRows
    try {
      rawRows = await parseS3Import(key)
    } catch (err: any) {
      return NextResponse.json({ error: "Failed to parse file: " + err.message }, { status: 400 })
    }

    if (rawRows.length === 0) return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 })

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped  = 0

    try {
      for (const row of rawRows) {
        if (!row["name"]?.trim()) continue
        try {
          await conn.execute(rawMaterials.insert, toRmParams(row))
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") { skipped++ } else { throw err }
        }
      }
      await conn.commit()
      return NextResponse.json({ inserted, skipped })
    } catch (err: any) {
      await conn.rollback()
      return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
