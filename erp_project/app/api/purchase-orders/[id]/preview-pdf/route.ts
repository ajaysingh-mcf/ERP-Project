// GET /api/purchase-orders/[id]/preview-pdf
// Generates and streams the PO PDF inline so the browser can display it.

export const runtime = "nodejs"

import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { fetchPoData } from "@/lib/mailer"
import { generatePoPdf } from "@/lib/pdf/po-document"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return new Response("Unauthenticated", { status: 401 })
  }

  const { id } = await params
  const poId = parseInt(id)
  if (isNaN(poId)) return new Response("Invalid PO id", { status: 400 })

  const rows = await query<{ po_no: string }>(purchaseOrdersSql.selectForEdit, [poId])
  if (!rows[0]) return new Response("PO not found", { status: 404 })

  const data = await fetchPoData(poId)
  if (!data) return new Response("PO not found", { status: 404 })

  const pdf = await generatePoPdf(data)

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="PO-${rows[0].po_no}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
