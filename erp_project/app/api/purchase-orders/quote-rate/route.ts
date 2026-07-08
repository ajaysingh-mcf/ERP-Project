/**
 * GET /api/purchase-orders/quote-rate?sku_code=&mfg_id=
 *
 * Auto-computes the per-unit PO rate for a SKU + Manufacturer combination,
 * reusing the exact same Final Costing formula as the Manufacturing module
 * (app/manufacturing/[mfgId]/page.tsx FinalCostingTabContent):
 *   wastage = (rm_cost + pm_cost) * 0.10
 *   rate    = rm_cost + pm_cost + wastage + jw + shrink + shipper
 *
 * Returns 404 when the SKU isn't linked to that manufacturer via an active
 * master_bom_mfg line, or when no material cost can be computed — the PO
 * dialogs block submission in either case rather than falling back to a
 * manually-typed rate.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { manufacturingSql } from "@/lib/queries/manufacturing"
import type { MiscCostType } from "@/types/masters"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const skuCode = sp.get("sku_code")
  const mfgId = Number(sp.get("mfg_id"))
  if (!skuCode || !mfgId) {
    return NextResponse.json({ error: "sku_code and mfg_id are required" }, { status: 400 })
  }

  const [lineRows, materialCostRows, miscCostRows] = await Promise.all([
    query<{ bom_id: number; sku_code: string }>(manufacturingSql.selectLinesByMfg, [mfgId, "active", "active"]),
    query<{ bom_id: number; rm_cost: string; pm_cost: string }>(manufacturingSql.selectMaterialCostByMfg, [mfgId, mfgId, mfgId]),
    query<{ bom_id: number; type: MiscCostType; cost: string }>(manufacturingSql.selectMiscCostsByMfg, [mfgId]),
  ])

  const line = lineRows.find((l) => l.sku_code === skuCode)
  if (!line) {
    return NextResponse.json(
      { error: "No active production line links this SKU to the selected manufacturer." },
      { status: 404 }
    )
  }

  const material = materialCostRows.find((r) => r.bom_id === line.bom_id)
  if (!material) {
    return NextResponse.json(
      { error: "No costing available for this SKU/Manufacturer combination." },
      { status: 404 }
    )
  }

  const rm = Number(material.rm_cost)
  const pm = Number(material.pm_cost)
  const misc: Record<MiscCostType, number> = { jw: 0, shrink: 0, shipper: 0 }
  for (const r of miscCostRows) {
    if (r.bom_id === line.bom_id) misc[r.type] = Number(r.cost)
  }
  const wastage = (rm + pm) * 0.10
  const rate = rm + pm + wastage + misc.jw + misc.shrink + misc.shipper

  return NextResponse.json({ rate })
}
