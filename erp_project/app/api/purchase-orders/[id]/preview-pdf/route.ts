// GET /api/purchase-orders/[id]/preview-pdf
// Generates and streams the PO PDF inline so the browser can display it.

export const runtime = "nodejs"

import { query } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import { fetchPoData } from "@/lib/mailer"
import { generatePoPdf } from "@/lib/pdf/po-document"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { poIdParamSchema } from "@/lib/validation/purchase-order-detail"

export const GET = withGateway({
  paramsSchema: poIdParamSchema,
  handler: async ({ params }) => {
    const poId = params.id

    const rows = await query<{ po_no: string }>(purchaseOrdersSql.selectForEdit, [poId])
    if (!rows[0]) throw new ApiError(404, "not_found", "PO not found")

    const data = await fetchPoData(poId)
    if (!data) throw new ApiError(404, "not_found", "PO not found")

    const pdf = await generatePoPdf(data)

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="PO-${rows[0].po_no}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  },
})
