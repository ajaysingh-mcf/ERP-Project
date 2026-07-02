"use client"

import {
  AlertTriangle, ArrowDown, ArrowUp, Ban, ChevronsUpDown,
  Download, FileText, Loader2, Mail, MoreVertical, Pencil, Scissors,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { BadgeVariant, PoRow } from "./po-types"
import { STATUS_CONFIG } from "./po-types"
import { fmtDate, fmtInt, fmtMoney, fmtRate, isImpromptu, num } from "./po-utils"

// tolerance = min(100 units, 10% of original qty)
function poTolerance(qty: number) {
  return Math.min(100, Math.floor(qty * 0.10))
}

// ── Progress bar cell ─────────────────────────────────────────────────────────
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

// ── Short-close confirmation dialog ──────────────────────────────────────────
function ShortCloseDialog({
  open, poId, onClose, onDone,
}: {
  open: boolean
  poId: number
  onClose: () => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/close`, { method: "POST" })
      if (res.ok) { onDone(); onClose() }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <Ban className="h-4 w-4" /> Short Close PO?
          </DialogTitle>
          <DialogDescription className="pt-1 text-sm text-foreground">
            This will mark the PO as <strong>Short Closed</strong>. Use this when a significant
            remaining quantity will not be fulfilled. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={onClose}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="inline-flex items-center gap-1.5 justify-center rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Closing…</> : "Confirm Short Close"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Three-dot action menu ─────────────────────────────────────────────────────
type MenuAction = {
  label: string
  icon: React.ReactNode
  onClick: () => void
  variant?: "default" | "warning" | "destructive"
  disabled?: boolean
  disabledReason?: string
}

function ActionMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen]         = useState(false)
  const ref                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (actions.length === 0) return null

  const variantCls: Record<string, string> = {
    default:     "text-foreground hover:bg-accent",
    warning:     "text-amber-700 hover:bg-amber-50",
    destructive: "text-destructive hover:bg-destructive/10",
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent transition-colors"
        aria-label="More actions"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-border bg-popover shadow-md">
          {actions.map((action, i) => (
            action.disabled ? (
              <div
                key={i}
                title={action.disabledReason}
                className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground cursor-not-allowed opacity-60"
              >
                {action.icon}
                {action.label}
                <AlertTriangle className="ml-auto h-3 w-3 text-amber-400" />
              </div>
            ) : (
              <button
                key={i}
                onClick={() => { setOpen(false); action.onClick() }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${variantCls[action.variant ?? "default"]}`}
              >
                {action.icon}
                {action.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sortable column header ────────────────────────────────────────────────────
type SortDir = "asc" | "desc"

function SortHead({
  children, colKey, sortBy, sortDir, onSort, className,
}: {
  children: React.ReactNode
  colKey: string
  sortBy: string
  sortDir: SortDir
  onSort: (key: string) => void
  className?: string
}) {
  const active = sortBy === colKey
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(colKey)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors whitespace-nowrap"
      >
        {children}
        {active
          ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />
        }
      </button>
    </TableHead>
  )
}

// ── Main table ────────────────────────────────────────────────────────────────
export default function PoTable({
  rows,
  sessionUserId,
  onEdit,
  onSplit,
  sortBy,
  sortDir,
  onSort,
}: {
  rows: PoRow[]
  sessionUserId: number
  onEdit: (row: PoRow) => void
  onSplit: (row: PoRow) => void
  sortBy: string
  sortDir: SortDir
  onSort: (key: string) => void
}) {
  const router                                      = useRouter()
  const [shortCloseTarget, setShortCloseTarget]     = useState<number | null>(null)
  const sh = { sortBy, sortDir, onSort }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead colKey="po_no"        {...sh}>PO No.</SortHead>
                  <SortHead colKey="mfg_name"     {...sh}>Manufacturer</SortHead>
                  <SortHead colKey="date"         {...sh}>PO Date</SortHead>
                  <SortHead colKey="expected_on"  {...sh}>Exp. Dispatch</SortHead>
                  <SortHead colKey="sku_code"     {...sh}>SKU</SortHead>
                  <TableHead>SKU Status</TableHead>
                  <SortHead colKey="qty"          {...sh} className="text-right">PO Qty</SortHead>
                  <TableHead>Received</TableHead>
                  <SortHead colKey="unit_price"   {...sh}>Rate</SortHead>
                  <SortHead colKey="total_amount" {...sh}>Amount</SortHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Destination</TableHead>
                  <SortHead colKey="status"       {...sh}>Status</SortHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center text-muted-foreground py-10">
                      No purchase orders match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const status = r.status ?? "draft"
                    const cfg    = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as BadgeVariant }

                    const canEdit  = status === "draft" && r.po_raised_by === sessionUserId
                    const canSplit = ["draft", "raised", "punched", "partially_received"].includes(status)

                    // Three-dot menu items
                    const originalQty   = num(r.qty)
                    const receivedQty   = num(r.received_qty)
                    const remaining     = originalQty - receivedQty
                    const tolerance     = poTolerance(originalQty)
                    const canShortClose = ["raised", "punched", "partially_received"].includes(status) && remaining > tolerance
                    const canSendEmail  = status === "raised"
                    const hasEmail      = !!r.mfg_email
                    const isSent        = !!r.email_sent_at
                    const hasAttachment = !!r.attachment_key

                    const menuActions: MenuAction[] = []

                    if (canSendEmail) {
                      menuActions.push({
                        label:    isSent ? "Resend PO Email" : "Send PO Email",
                        icon:     <Mail className="h-3.5 w-3.5" />,
                        disabled: !hasEmail,
                        disabledReason: "No email address on file for this manufacturer",
                        onClick: async () => {
                          await fetch(`/api/purchase-orders/${r.id}/send-email`, { method: "POST" })
                          router.refresh()
                        },
                      })
                    }

                    if (hasAttachment) {
                      menuActions.push({
                        label:   "Review PDF",
                        icon:    <FileText className="h-3.5 w-3.5" />,
                        onClick: async () => {
                          const res  = await fetch(`/api/files/presign?key=${encodeURIComponent(r.attachment_key!)}`)
                          const data = await res.json()
                          if (data.url) window.open(data.url, "_blank", "noopener,noreferrer")
                        },
                      })
                    }

                    if (canShortClose) {
                      menuActions.push({
                        label:   "Short Close",
                        icon:    <Ban className="h-3.5 w-3.5" />,
                        variant: "warning",
                        onClick: () => setShortCloseTarget(r.id),
                      })
                    }

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

                        <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">{fmtDate(r.expected_on)}</TableCell>

                        {/* SKU */}
                        <TableCell className="whitespace-nowrap">
                          <div className="font-mono text-xs font-medium">{r.sku_code ?? "—"}</div>
                          <div className="text-xs text-muted-foreground max-w-[140px] truncate">{r.sku_name ?? ""}</div>
                        </TableCell>

                        {/* SKU status */}
                        <TableCell>
                          {r.sku_status ? (
                            <Badge variant={r.sku_status === "active" ? "success" : "secondary"} className="capitalize">
                              {r.sku_status}
                            </Badge>
                          ) : "—"}
                        </TableCell>

                        <TableCell className="text-right text-xs font-medium tabular-nums">{fmtInt(r.qty)}</TableCell>

                        <TableCell><ProgressCell value={r.received_qty} total={r.qty} /></TableCell>

                        <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          {fmtRate(r.unit_price)}
                        </TableCell>

                        <TableCell className="text-xs tabular-nums whitespace-nowrap">{fmtMoney(r.total_amount)}</TableCell>

                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {r.invoice_no ?? "—"}
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {r.destination ?? "—"}
                        </TableCell>

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
                                title="Split PO"
                                className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent transition-colors"
                              >
                                <Scissors className="h-3 w-3" />
                              </button>
                            )}
                            {menuActions.length > 0 && (
                              <ActionMenu actions={menuActions} />
                            )}
                            {!canEdit && !canSplit && menuActions.length === 0 && (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Short close confirmation — rendered outside table to avoid z-index issues */}
      <ShortCloseDialog
        open={shortCloseTarget !== null}
        poId={shortCloseTarget ?? 0}
        onClose={() => setShortCloseTarget(null)}
        onDone={() => router.refresh()}
      />
    </>
  )
}
