"use client"

import { AlertTriangle, Download, FileText, Loader2, Mail, Pencil, Scissors } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { BadgeVariant, PoRow } from "./po-types"
import { STATUS_CONFIG } from "./po-types"
import { fmtDate, fmtInt, fmtMoney, isImpromptu, num } from "./po-utils"

function ProgressCell({ value, total }: { value: string | number | null; total: string | number }) {
  const v = num(value)
  const t = num(total)
  const pct = t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0
  return (
    <div className="min-w-[72px]">
      <div className="text-xs font-medium tabular-nums">{fmtInt(v)}</div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ViewPoButton({ s3Key }: { s3Key: string }) {
  const [loading, setLoading] = useState(false)

  async function handleView() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/files/presign?key=${encodeURIComponent(s3Key)}`)
      const data = await res.json()
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleView}
      disabled={loading}
      title="View PO PDF"
      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent transition-colors disabled:opacity-50"
    >
      {loading
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <FileText className="h-3 w-3" />
      }
      View PO
    </button>
  )
}

const iconBtn = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent transition-colors disabled:opacity-50"

function RaisedPoActions({
  poId, poNo, attachmentKey, isSent, hasMfgEmail,
}: {
  poId: number
  poNo: string
  attachmentKey: string | null
  isSent: boolean
  hasMfgEmail: boolean
}) {
  const router                              = useRouter()
  const [sending,        setSending]        = useState(false)
  const [viewLoading,    setViewLoading]    = useState(false)
  const [errDialogOpen,  setErrDialogOpen]  = useState(false)

  async function handleSend() {
    setSending(true)
    try {
      const res  = await fetch(`/api/purchase-orders/${poId}/send-email`, { method: "POST" })
      if (res.ok) router.refresh()
    } finally {
      setSending(false)
    }
  }

  async function handleView() {
    if (!attachmentKey) return
    setViewLoading(true)
    try {
      const res  = await fetch(`/api/files/presign?key=${encodeURIComponent(attachmentKey)}`)
      const data = await res.json()
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer")
    } finally {
      setViewLoading(false)
    }
  }

  // No email on file — show warning icon immediately, no send button
  if (!hasMfgEmail) {
    return (
      <>
        <button
          onClick={() => setErrDialogOpen(true)}
          title="No email on file"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-500 hover:bg-amber-50 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
        </button>
        <Dialog open={errDialogOpen} onOpenChange={setErrDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Cannot Send Email
              </DialogTitle>
              <DialogDescription className="pt-1 text-sm text-foreground">
                Manufacturer has no email address on file. Add an email in the Manufacturer master first.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => setErrDialogOpen(false)}
                className="inline-flex items-center justify-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (isSent) {
    return (
      <div className="flex items-center gap-1">
        <button onClick={handleSend} disabled={sending} title="Re-send email" className={iconBtn}>
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        </button>
        {attachmentKey && (
          <button onClick={handleView} disabled={viewLoading} title="View PO" className={iconBtn}>
            {viewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={handleSend}
      disabled={sending}
      title={`Send PO ${poNo} to manufacturer`}
      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
    >
      {sending ? <><Loader2 className="h-3 w-3 animate-spin" /> Sending…</> : <><Mail className="h-3 w-3" /> Send PO</>}
    </button>
  )
}

export default function PoTable({
  rows,
  sessionUserId,
  onEdit,
  onSplit,
}: {
  rows: PoRow[]
  sessionUserId: number
  onEdit: (row: PoRow) => void
  onSplit: (row: PoRow) => void
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Manufacturer</TableHead>
              <TableHead>PO Date</TableHead>
              <TableHead>Exp. Dispatch</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>SKU Status</TableHead>
              <TableHead className="text-right">PO Qty</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Invoice No</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground py-10">
                  No purchase orders match your filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const status   = r.status ?? "draft"
                const cfg      = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as BadgeVariant }
                const canEdit  = status === "draft" && r.po_raised_by === sessionUserId
                const canSplit = ["draft", "raised", "punched", "partially_received"].includes(status)
                const canSend  = status === "raised"

                return (
                  <TableRow key={r.id}>
                    {/* PO Number */}
                    <TableCell className="font-mono text-xs font-medium whitespace-nowrap">
                      {r.po_no}
                      {(r.po_type === "impromptu" || isImpromptu(r.po_no)) && (
                        <Badge variant="warning" className="ml-1.5 px-1.5 py-0 text-[10px]">IMP</Badge>
                      )}
                    </TableCell>

                    {/* Manufacturer */}
                    <TableCell className="whitespace-nowrap">
                      <div className="text-xs font-medium">{r.mfg_name}</div>
                      <div className="text-[11px] text-muted-foreground">{r.mfg_code}</div>
                    </TableCell>

                    <TableCell className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.date)}</TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.expected_on)}</TableCell>

                    {/* SKU */}
                    <TableCell className="whitespace-nowrap">
                      <div className="font-mono text-xs font-medium">{r.sku_code ?? "—"}</div>
                      <div className="text-xs text-muted-foreground max-w-[160px] truncate">{r.sku_name ?? ""}</div>
                    </TableCell>

                    {/* SKU status */}
                    <TableCell>
                      {r.sku_status ? (
                        <Badge
                          variant={r.sku_status === "active" ? "success" : "secondary"}
                          className="capitalize"
                        >
                          {r.sku_status}
                        </Badge>
                      ) : "—"}
                    </TableCell>

                    <TableCell className="text-right text-xs font-medium tabular-nums">{fmtInt(r.qty)}</TableCell>

                    <TableCell><ProgressCell value={r.received_qty} total={r.qty} /></TableCell>

                    <TableCell className="text-xs tabular-nums">{fmtMoney(r.total_amount)}</TableCell>

                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {r.invoice_no ?? "—"}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.destination ?? "—"}
                    </TableCell>

                    {/* Status badge */}
                    <TableCell>
                      <Badge variant={cfg.variant} className="whitespace-nowrap">{cfg.label}</Badge>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canEdit && (
                          <button
                            onClick={() => onEdit(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        )}
                        {canSplit && (
                          <button
                            onClick={() => onSplit(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent transition-colors"
                          >
                            <Scissors className="h-3 w-3" />
                          </button>
                        )}
                        {canSend && (
                          <RaisedPoActions
                            poId={r.id}
                            poNo={r.po_no}
                            attachmentKey={r.attachment_key}
                            isSent={!!r.email_sent_at}
                            hasMfgEmail={!!r.mfg_email}
                          />
                        )}
                        {!canSend && r.attachment_key && <ViewPoButton s3Key={r.attachment_key} />}
                        {!canEdit && !canSplit && !canSend && !r.attachment_key && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
