import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import logger from "@/lib/logger"
import { query } from "@/lib/db"
import { bom as bomSql } from "@/lib/queries/bom"
import {
  pmCreate, pmCheckDuplicate, pmCheckVendor,
  pmCreateFull, pmAddRates, pmBulk, pmS3Bulk,
} from "@/app/api/masters/packing-materials/pm-handler"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const body = await req.json()
  const { action } = body
  const ctx = { requestId: crypto.randomUUID(), userId, route: "/api/masters/packing-material" }
  logger.info({ ...ctx, message: "Packing Material API request received" })

  if (action === "create") return pmCreate(body, userId, ctx)
  if (action === "check-PM") return pmCheckDuplicate(body, ctx)
  if (action === "check-vendor") return pmCheckVendor(body, ctx)
  if (action === "create-full") return pmCreateFull(body, userId, ctx)
  if (action === "add-rates") return pmAddRates(body, userId, ctx)
  if (action === "bulk") return pmBulk(body, userId, ctx)
  if (action === "bulk_from_s3") return pmS3Bulk(body, userId, ctx)

  if (action === "material-impact") {
    const { pm_id, scope, mfg_id } = body
    const rows = scope === "mfg" && mfg_id
      ? await query<{ sku_code: string; name: string }>(bomSql.selectActiveSkusUsingMaterialForMfg, [mfg_id, "pm", pm_id])
      : await query<{ sku_code: string; name: string }>(bomSql.selectActiveSkusUsingMaterial, ["pm", pm_id])
    return NextResponse.json({ count: rows.length, skus: rows })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
