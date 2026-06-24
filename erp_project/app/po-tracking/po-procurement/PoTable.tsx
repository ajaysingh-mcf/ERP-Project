"use client"

import { Pencil, Scissors } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
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
                const canEdit  = ["draft", "raised", "punched"].includes(status) && r.po_raised_by === sessionUserId
                const canSplit = ["draft", "raised", "punched", "partially_received"].includes(status)

                return (
                  <TableRow key={r.id}>
                    {/* PO Number */}
                    <TableCell className="font-mono text-xs font-medium whitespace-nowrap">
                      {r.po_no}
                      {isImpromptu(r.po_no) && (
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
                            <Scissors className="h-3 w-3" /> Split
                          </button>
                        )}
                        {!canEdit && !canSplit && (
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
