import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import logger from "@/lib/logger"
import { query } from "@/lib/db"
import { getRmDistinctMakes, getRmDistinctInciNames } from "@/lib/cached-reference-data"
import { bom as bomSql } from "@/lib/queries/bom"
import {
  rmCreate, rmCheckDuplicate, rmCheckVendor,
  rmCreateFull, rmAddRates, rmBulk, rmS3Bulk,
} from "@/app/api/masters/raw-materials/rm-handler"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = parseInt(session.user.id)

  const body = await req.json()
  const { action } = body
  const ctx = { requestId: crypto.randomUUID(), userId, route: "/api/masters/raw-materials" }
  logger.info({ ...ctx, action, message: "Raw Materials API request received" })

  if (action === "create")       return rmCreate(body, userId, ctx)
  if (action === "check-RM")     return rmCheckDuplicate(body, ctx)
  if (action === "check-vendor") return rmCheckVendor(body, ctx)
  if (action === "create-full")  return rmCreateFull(body, userId, ctx)
  if (action === "add-rates")    return rmAddRates(body, userId, ctx)
  if (action === "bulk")         return rmBulk(body, userId, ctx)
  if (action === "bulk_from_s3") return rmS3Bulk(body, userId, ctx)

  if (action === "get-makes") {
    const rows = await getRmDistinctMakes()
    return NextResponse.json({ makes: rows.map((r) => r.make) })
  }
  if (action === "get-inci-names") {
    const rows = await getRmDistinctInciNames()
    return NextResponse.json({ inciNames: rows.map((r) => r.inci_name) })
  }

  if (action === "material-impact") {
    const { rm_id, scope, mfg_id } = body
    const rows = scope === "mfg" && mfg_id
      ? await query<{ sku_code: string; name: string }>(bomSql.selectActiveSkusUsingMaterialForMfg, [mfg_id, "rm", rm_id])
      : await query<{ sku_code: string; name: string }>(bomSql.selectActiveSkusUsingMaterial, ["rm", rm_id])
    return NextResponse.json({ count: rows.length, skus: rows })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
