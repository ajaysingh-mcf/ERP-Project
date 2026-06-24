import nodemailer from "nodemailer"
import { query } from "@/lib/db"
import { generatePoPdf, type PoEmailData } from "@/lib/pdf/po-document"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

const PO_DATA_SQL = `
  SELECT
    po.po_no, po.date, po.expected_on, po.destination,
    po.sku_code, po.qty, po.unit_price, po.total_amount,
    sk.name           AS sku_name,
    m.code            AS mfg_code,
    m.name            AS mfg_name,
    d.registered_name, d.gst_number, d.location, d.email AS mfg_email,
    wh.location       AS dest_location,
    u.name            AS raised_by_name
  FROM purchase_orders po
  INNER JOIN master_mfgs     m  ON m.id          = po.mfg_id
  INNER JOIN details_mfg     d  ON d.mfg_id      = m.id
  LEFT  JOIN master_skus     sk ON sk.sku_code    = po.sku_code
  LEFT  JOIN master_warehouse wh ON wh.name       = po.destination
  LEFT  JOIN (
    SELECT entity_id, raised_by FROM approvals
    WHERE module = 'PO'
    ORDER BY id DESC
  ) latest ON latest.entity_id = po.id
  LEFT  JOIN users u ON u.id = latest.raised_by
  WHERE po.id = ?
  LIMIT 1
`

export async function fetchPoData(poId: number): Promise<PoEmailData | null> {
  const rows = await query<any>(PO_DATA_SQL, [poId])
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

  const from = process.env.GMAIL_USER
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
