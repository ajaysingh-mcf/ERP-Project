// POST /api/purchase-orders/[id]/send-email
// Manually resend the PO email to the manufacturer.
// Only allowed for POs in 'raised' status.

export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, execute } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { sendPoEmail } from "@/lib/mailer"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { id } = await params
  const poId = parseInt(id)
  if (isNaN(poId)) return NextResponse.json({ error: "Invalid PO id" }, { status: 400 })

  const rows = await query<{ status: string }>(purchaseOrdersSql.selectForEdit, [poId])
  if (!rows[0]) return NextResponse.json({ error: "PO not found" }, { status: 404 })
  if (rows[0].status !== "raised") {
    return NextResponse.json(
      { error: "Email can only be sent for POs in 'raised' status." },
      { status: 409 }
    )
  }

  try {
    await sendPoEmail(poId)
    await execute(purchaseOrdersSql.setEmailSentAt, [poId])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[send-email] failed:", err)
    return NextResponse.json({ error: "Failed to send email: " + err.message }, { status: 500 })
  }
}
