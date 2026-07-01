import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import logger from "@/lib/logger"
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

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
