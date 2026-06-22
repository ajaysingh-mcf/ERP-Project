import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { execute, query, pool } from "@/lib/db"
import { PMMaterials } from "@/lib/queries/packing-materials"
import { PmRateTable } from "@/app/masters/packing-materials/PmRateTable"

function toPmParams(r: any) {
  return [
    r.pm_code?.trim() || null,
    r.name.trim(),
    r.type?.trim() || null,
    r.hsn_code?.trim() || null,
    r.uom?.trim() || null,
    r.status || "active",
  ]
}

function toVendorRateParams(pmId: number, r: any) {
  return [
    pmId,
    r.vendor_id ? Number(r.vendor_id) : null,
    r.vendor_code?.trim() || null,
    r.curr_rate ? Number(r.curr_rate) : null,
    r.moq ? Number(r.moq) : null,
    r.rate_uom?.trim() || null,
    r.rate_status || "active",
    r.effective_from?.trim() || null,
    r.effective_to?.trim() || null,
  ]
}

function toMfgRateParams(pmId: number, r: any) {
  return [
    pmId,
    r.mfg_id ? Number(r.mfg_id) : null,
    r.mfg_code?.trim() || null,
    r.curr_rate ? Number(r.curr_rate) : null,
    r.rate_uom?.trim() || null,
    r.rate_status || "active",
    r.effective_from?.trim() || null,
  ]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body

  // ── Existing flat create (CSV / legacy dialog) ──────────────────────────
  if (action === "create") {
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const hasVendorRate = !!body.vendor_code?.trim()
    const hasMfgRate = !!body.mfg_code?.trim()

    if (hasVendorRate || hasMfgRate) {
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        const [pmResult] = await conn.execute(PMMaterials.insert, toPmParams(body))
        const pmId = (pmResult as any).insertId

        if (hasVendorRate) {
          await conn.execute(PMMaterials.insertVendorRate, toVendorRateParams(pmId, body))
        } else {
          await conn.execute(PMMaterials.insertMfgRate, toMfgRateParams(pmId, body))
        }

        await conn.commit()
        return NextResponse.json({ id: pmId })
      } catch (err: any) {
        await conn.rollback()
        console.error("Packing material + rate insert error:", err)
        return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
      } finally {
        conn.release()
      }
    }

    try {
      const result = await execute(PMMaterials.insert, toPmParams(body))
      return NextResponse.json({ id: result.insertId })
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: `PM code "${body.pm_code?.trim()}" already exists` },
          { status: 409 }
        )
      }
      console.error("Packing material create error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  // ── Wizard step 1: duplicate PM check ───────────────────────────────────
  // Body: { name, type }
  if (action === "check-PM") {
    const { name, type } = body
    if (!name?.trim() || !type?.trim()) {
      return NextResponse.json({ error: "name and type are required" }, { status: 400 })
    }
    try {
      const rows = await query<{ id: number }>(PMMaterials.checkDuplicate, [
        name.trim(),
        type.trim(),
      ])
      return NextResponse.json({ exists: rows.length > 0 })
    } catch (err: any) {
      console.error("Packing material check error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  // ── Wizard step 2: check if vendor already has a rate for this material ─
  // Body: { name, type, vendor_id }
  // Returns: { exists: false } | { exists: true, existing: { curr_rate, moq, uom } }
  if (action === "check-vendor") {
    const { name, type, vendor_id } = body
    if (!name?.trim() || !vendor_id) {
      return NextResponse.json({ error: "name and vendor_id are required" }, { status: 400 })
    }
    try {
      const pms = await query<{ id: number }>(PMMaterials.checkDuplicate, [
        name.trim(),
        type?.trim() || "",
      ])
      if (pms.length === 0) return NextResponse.json({ exists: false })

      const rates = await query<any>(PMMaterials.checkVendorRate, [pms[0].id, Number(vendor_id)])
      if (rates.length === 0) return NextResponse.json({ exists: false })

      const r = rates[0]
      return NextResponse.json({
        exists: true,
        existing: { curr_rate: r.curr_rate, moq: r.moq, uom: r.uom },
      })
    } catch (err: any) {
      console.error("PM vendor rate check error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  // ── Wizard final submit: create PM + upsert vendor rates + mfg approvals ─
  if (action === "create-full") {
    const { pm } = body
    const vendorList = Array.isArray(body.vendors) ? body.vendors : []
    const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
    if (!pm?.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const [pmResult] = await conn.execute(PMMaterials.insert, [
        null,
        pm.name.trim(),
        pm.type?.trim() || null,
        pm.hsn_code?.trim() || null,
        pm.uom?.trim() || null,
        pm.status || "active",
      ])
      const pmId = (pmResult as any).insertId

      // Vendor rates: upsert — archive old rate to vrm_history then update, else insert.
      for (const v of vendorList) {
        const vendorId = v.vendor_id ? Number(v.vendor_id) : null

        const [existingRows] = await conn.execute(PMMaterials.checkVendorRate, [pmId, vendorId])
        const existing = (existingRows as any[])[0]

        if (existing) {
          await conn.execute(PMMaterials.archiveVendorRate, [
            pmId,
            existing.vendor_id,
            existing.curr_rate,
            existing.moq,
            existing.uom,
            existing.effective_from,
            existing.effective_to,
            existing.status,
          ])
          await conn.execute(PMMaterials.archiveToHistoryVrm, [
            pmId, existing.vendor_id, existing.curr_rate,
            existing.effective_from, existing.effective_to, existing.status,
          ])
          await conn.execute(PMMaterials.updateVendorRate, [
            v.curr_rate ? Number(v.curr_rate) : null,
            v.moq ? Number(v.moq) : null,
            v.rate_uom?.trim() || null,
            "active",
            today,
            existing.id,
          ])
        } else {
          await conn.execute(PMMaterials.insertVendorRate, [
            pmId,
            vendorId,
            v.vendor_code?.trim() || null,
            v.curr_rate ? Number(v.curr_rate) : null,
            v.moq ? Number(v.moq) : null,
            v.rate_uom?.trim() || null,
            "active",
            today,
            null,
          ])
        }
      }

      // Manufacturer approvals: upsert — update if exists, else insert.
      for (const m of mfgList) {
        const mfgId = m.mfg_id ? Number(m.mfg_id) : null

        const [existingRows] = await conn.execute(PMMaterials.checkMfgRate, [pmId, mfgId])
        const existing = (existingRows as any[])[0]

        if (existing) {
          await conn.execute(PMMaterials.archiveToHistoryMrm, [
            existing.mfg_id, pmId, null, existing.curr_rate,
            existing.effective_from, null, existing.status === "active" ? 1 : 0,
          ])
          await conn.execute(PMMaterials.updateMfgRate, [
            m.curr_rate ? Number(m.curr_rate) : existing.curr_rate,
            m.rate_uom?.trim() || existing.uom,
            today,
            existing.id,
          ])
        } else {
          await conn.execute(PMMaterials.insertMfgApproval, [
            pmId,
            mfgId,
            m.mfg_code?.trim() || null,
            today,
          ])
        }
      }

      await conn.commit()
      return NextResponse.json({ id: pmId })
    } catch (err: any) {
      await conn.rollback()
      console.error("Packing material create-full error:", err)
      return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  // Add vendor rates and/or mfg approvals to an EXISTING PM (no new pm row inserted).
  // Body: { name, type, vendors: [...], manufacturers: [...] }
  if (action === "add-rates") {
    const { name, type, pm_id } = body
    const vendorList = Array.isArray(body.vendors) ? body.vendors : []
    const mfgList = Array.isArray(body.manufacturers) ? body.manufacturers : []
    if (vendorList.length === 0 && mfgList.length === 0) {
      return NextResponse.json({ error: "Provide at least one vendor rate or manufacturer" }, { status: 400 })
    }
    try {
      let pmId: number
      if (pm_id) {
        pmId = Number(pm_id)
      } else {
        if (!name?.trim()) {
          return NextResponse.json({ error: "name is required" }, { status: 400 })
        }
        const pms = await query<{ id: number }>(PMMaterials.checkDuplicate, [
          name.trim(),
          type?.trim() || "",
        ])
        if (pms.length === 0) {
          return NextResponse.json({ error: "Material not found" }, { status: 404 })
        }
        pmId = pms[0].id
      }
      const today = new Date().toISOString().slice(0, 10)
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        for (const v of vendorList) {
          const vendorId = v.vendor_id ? Number(v.vendor_id) : null
          const [existingRows] = await conn.execute(PMMaterials.checkVendorRate, [pmId, vendorId])
          const existing = (existingRows as any[])[0]
          if (existing) {
            await conn.execute(PMMaterials.archiveVendorRate, [
              pmId, existing.vendor_id, existing.curr_rate, existing.moq,
              existing.uom, existing.effective_from, existing.effective_to, existing.status,
            ])
            await conn.execute(PMMaterials.archiveToHistoryVrm, [
              pmId, existing.vendor_id, existing.curr_rate,
              existing.effective_from, existing.effective_to, existing.status,
            ])
            await conn.execute(PMMaterials.updateVendorRate, [
              v.curr_rate ? Number(v.curr_rate) : null,
              v.moq ? Number(v.moq) : null,
              v.rate_uom?.trim() || null,
              "active",
              today,
              existing.id,
            ])
          } else {
            await conn.execute(PMMaterials.insertVendorRate, [
              pmId, vendorId, v.vendor_code?.trim() || null,
              v.curr_rate ? Number(v.curr_rate) : null,
              v.moq ? Number(v.moq) : null,
              v.rate_uom?.trim() || null,
              "active", today, null,
            ])
          }
        }
        for (const m of mfgList) {
          const mfgId = m.mfg_id ? Number(m.mfg_id) : null
          const [existingRows] = await conn.execute(PMMaterials.checkMfgRate, [pmId, mfgId])
          const existing = (existingRows as any[])[0]
          
          if (existing) {
            const ven_id = await conn.execute(PMMaterials.getVendorId , [pmId]);
            await conn.execute(PMMaterials.archiveToHistoryMrm, [
              existing.mfg_id, pmId, ven_id, existing.curr_rate,
              existing.effective_from, null, existing.status === "active" ? 1 : 0,
            ])
            await conn.execute(PMMaterials.updateMfgRate, [
              m.curr_rate ? Number(m.curr_rate) : existing.curr_rate,
              m.rate_uom?.trim() || existing.uom,
              today,
              existing.id,
            ])
          } else {
            await conn.execute(PMMaterials.insertMfgApproval, [pmId, mfgId, m.mfg_code?.trim() || null, today])
          }
        }
        await conn.commit()
        return NextResponse.json({ pmId })
      } catch (err: any) {
        await conn.rollback()
        console.error("Packing material add-rates error:", err)
        return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 })
      } finally {
        conn.release()
      }
    } catch (err: any) {
      console.error("Packing material add-rates lookup error:", err)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }
  }

  // ── CSV bulk import ──────────────────────────────────────────────────────
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
          await conn.execute(PMMaterials.insert, toPmParams(row))
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
      console.error("Packing material bulk insert error:", err)
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
