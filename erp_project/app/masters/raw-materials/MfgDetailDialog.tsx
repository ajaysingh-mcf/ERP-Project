"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { RMByMfg } from "@/types/masters"

function fmt(v: string | number | null | undefined) {
  return v != null && String(v).trim() !== "" ? String(v) : "—"
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—"
  return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

export function MfgDetailDialog({
  row,
  allRows,
  onClose,
}: {
  row: RMByMfg | null
  allRows: RMByMfg[]
  onClose: () => void
}) {
  const mfgRows = useMemo(() => {
    if (!row?.rm_id) return []
    return allRows.filter((r) => r.rm_id === row.rm_id)
  }, [row, allRows])

  const bestRateRow = useMemo(() => {
    const valid = mfgRows.filter((r) => r.curr_rate != null)
    if (!valid.length) return null
    return valid.reduce((best, r) =>
      parseFloat(r.curr_rate!) < parseFloat(best.curr_rate!) ? r : best
    )
  }, [mfgRows])

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        <DialogHeader>
          <DialogTitle>Manufacturer Comparison</DialogTitle>
          <DialogDescription>
            Compare rate and approved vendor across manufacturers
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-5">
            {/* ── Material info card ── */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoField label="Material Code" value={fmt(row.rm_code)} />
              <InfoField label="Material Name" value={fmt(row.name)} />
              <InfoField label="UOM" value={fmt(row.uom)} />
              <InfoField label="Make" value={fmt(row.make)} />
              <InfoField label="Type" value={fmt(row.type)} />
              <InfoField label="INCI Name" value={fmt(row.inci_name)} />
            </div>

            {/* ── Manufacturer comparison table ── */}
            <div className="rounded-lg border border-border overflow-hidden">
              <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                <TableHeader>
                  <TableRow>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>Rate (₹)</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Approved Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Effective From</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mfgRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No manufacturer records found for this material.
                      </TableCell>
                    </TableRow>
                  ) : (
                    mfgRows.map((mr, i) => {
                      const isBest = bestRateRow?.mfg_id === mr.mfg_id
                      return (
                        <TableRow key={i}>
                          {/* Manufacturer */}
                          <TableCell>
                            <p className="font-medium text-sm">{fmt(mr.mfg_code)}</p>
                            {mr.mfg_id && (
                              <p className="text-xs text-muted-foreground">ID: {mr.mfg_id}</p>
                            )}
                          </TableCell>

                          {/* Rate */}
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className={cn("text-sm font-medium", isBest && "text-emerald-600")}>
                                {mr.curr_rate != null ? `₹${mr.curr_rate}` : "—"}
                              </span>
                              {isBest && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
                                  Best
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* UOM */}
                          <TableCell className="uppercase text-xs text-muted-foreground">
                            {fmt(mr.uom)}
                          </TableCell>

                          {/* Approved Vendor */}
                          <TableCell>
                            <p className="text-sm">{fmt(mr.approved_vendor_code)}</p>
                            {mr.approved_vendor_id && (
                              <p className="text-xs text-muted-foreground">ID: {mr.approved_vendor_id}</p>
                            )}
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Badge variant={mr.status === "active" ? "default" : "secondary"} className="capitalize">
                              {mr.status ?? "—"}
                            </Badge>
                          </TableCell>

                          {/* Effective From */}
                          <TableCell className="text-sm text-muted-foreground">
                            {fmtDate(mr.effective_from)}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ── Summary card ── */}
            {bestRateRow && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs text-emerald-700 font-medium mb-1">Best Rate</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    ₹{bestRateRow.curr_rate}
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">{fmt(bestRateRow.mfg_code)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Approved Vendor</p>
                  <p className="text-lg font-semibold">{fmt(bestRateRow.approved_vendor_code)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">for {fmt(bestRateRow.mfg_code)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
