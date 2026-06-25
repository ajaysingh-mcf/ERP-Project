import nodemailer from "nodemailer"
import { GMAIL_USER, GMAIL_APP_PASSWORD } from "@/lib/env"
import { query, execute } from "@/lib/db"
import { generatePoPdf, type PoEmailData } from "@/lib/pdf/po-document"
import { uploadFile } from "@/lib/s3"
import { s3FilesSql } from "@/lib/queries/s3-files"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
})

export async function fetchPoData(poId: number): Promise<PoEmailData | null> {
  const rows = await query<any>(purchaseOrdersSql.selectForEmail, [poId])
  const po = rows[0]
  if (!po) return null
  return {
    po_no:           po.po_no,
    date:            po.date,
    expected_on:     po.expected_on,
    destination:     po.destination,
    dest_location:   po.dest_location  ?? null,
    sku_code:        po.sku_code,
    sku_name:        po.sku_name,
    qty:             Number(po.qty),
    unit_price:      po.unit_price    ? Number(po.unit_price)   : null,
    total_amount:    po.total_amount  ? Number(po.total_amount) : null,
    mfg_name:        po.mfg_name,
    mfg_code:        po.mfg_code,
    registered_name: po.registered_name,
    gst_number:      po.gst_number,
    location:        po.location,
    mfg_email:       po.mfg_email,
    raised_by_name:  po.raised_by_name ?? "System",
  }
}

export async function sendPoEmail(poId: number): Promise<void> {
  const data = await fetchPoData(poId)

  if (!data) {
    console.warn(`[mailer] sendPoEmail: PO id=${poId} not found`)
    return
  }
  if (!data.mfg_email) {
    console.warn(`[mailer] sendPoEmail: PO id=${poId} — manufacturer has no email, skipping`)
    return
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await generatePoPdf(data)
    console.log(`[mailer] PDF generated for PO ${data.po_no} (${pdfBuffer.length} bytes)`)
  } catch (pdfErr: any) {
    console.error("[mailer] PDF generation failed:", pdfErr)
    throw new Error("PDF generation failed: " + pdfErr.message)
  }

  // Store PDF in S3 and save key to DB (non-blocking — email still sends if this fails)
  const safeMfgName = data.mfg_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const poMonth = data.date ? new Date(data.date).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7)
  const s3Key = `purchase-orders/${safeMfgName}/${poMonth}/PO-${data.po_no}.pdf`
  try {
    await uploadFile(pdfBuffer as unknown as Buffer, s3Key, "application/pdf")
    await execute(s3FilesSql.updatePoAttachment, [s3Key, poId])
    console.log(`[mailer] PO PDF stored at key=${s3Key}`)
  } catch (s3Err: any) {
    console.error("[mailer] S3 store failed (email will still send):", s3Err)
  }

  const from = GMAIL_USER
  const dispatchDate = data.expected_on
    ? new Date(data.expected_on).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "TBD"

  await transporter.sendMail({
    from: `mcaffeine ERP <${from}>`,
    to: data.mfg_email,
    subject: `Purchase Order ${data.po_no} — mcaffeine`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#111">
        <h2 style="margin-bottom:4px">Purchase Order: ${data.po_no}</h2>
        <p style="color:#555;margin-top:0">Please find your PO details attached as a PDF.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
          <tr style="background:#f5f5f5">
            <td style="padding:8px 12px;font-weight:600">SKU</td>
            <td style="padding:8px 12px">${data.sku_code} — ${data.sku_name ?? ""}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-weight:600">Quantity</td>
            <td style="padding:8px 12px">${Number(data.qty).toLocaleString("en-IN")}</td>
          </tr>
          <tr style="background:#f5f5f5">
            <td style="padding:8px 12px;font-weight:600">Expected Dispatch</td>
            <td style="padding:8px 12px">${dispatchDate}</td>
          </tr>
          ${data.destination ? `<tr><td style="padding:8px 12px;font-weight:600">Destination</td><td style="padding:8px 12px">${data.destination}</td></tr>` : ""}
        </table>
        <p style="font-size:12px;color:#888">
          This is an auto-generated email from the mcaffeine ERP system.
          Please confirm receipt by replying to this email.
        </p>
      </div>
    `,
    attachments: [
      {
        filename: `PO-${data.po_no}.pdf`,
        content: pdfBuffer,
      },
    ],
  })

  console.log(`[mailer] PO ${data.po_no} sent to ${data.mfg_email}`)
}
