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
import type { PMVendor } from "@/types/masters"

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

export function VendorPMDetailDialog({
  row,
  allRows,
  onClose,
}: {
  row: PMVendor | null
  allRows: PMVendor[]
  onClose: () => void
}) {
  const vendorRows = useMemo(() => {
    if (!row?.pm_code) return []
    return allRows.filter((r) => r.pm_code === row.pm_code)
  }, [row, allRows])

  const bestRateRow = useMemo(() => {
    const valid = vendorRows.filter((r) => r.curr_rate != null)
    if (!valid.length) return null
    return valid.reduce((best, r) =>
      parseFloat(r.curr_rate!) < parseFloat(best.curr_rate!) ? r : best
    )
  }, [vendorRows])

  const lowestMoqRow = useMemo(() => {
    const valid = vendorRows.filter((r) => r.moq != null)
    if (!valid.length) return null
    return valid.reduce((best, r) => (r.moq! < best.moq! ? r : best))
  }, [vendorRows])

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        <DialogHeader>
          <DialogTitle>Vendor Comparison</DialogTitle>
          <DialogDescription>
            Compare rate, MOQ and effective dates across vendors
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-5">
            {/* Material info card */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoField label="Material Code" value={fmt(row.pm_code)} />
              <InfoField label="Material Name" value={fmt(row.name)} />
              <InfoField label="Type" value={fmt(row.type)} />
              <InfoField label="HSN Code" value={fmt(row.hsn_code)} />
              <InfoField label="UOM" value={fmt(row.uom)} />
            </div>

            {/* Vendor comparison table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Rate (₹)</TableHead>
                    <TableHead>MOQ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approved At</TableHead>
                    <TableHead>Valid Until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No vendor records found for this material.
                      </TableCell>
                    </TableRow>
                  ) : (
                    vendorRows.map((vr, i) => {
                      const isBest = bestRateRow?.vendor_id === vr.vendor_id
                      const isLowestMoq = lowestMoqRow?.vendor_id === vr.vendor_id
                      return (
                        <TableRow key={i}>
                          <TableCell>
                            <p className="font-medium text-sm">{fmt(vr.vendor_code)}</p>
                            {vr.vendor_id && (
                              <p className="text-xs text-muted-foreground">ID: {vr.vendor_id}</p>
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className={cn("text-sm font-medium", isBest && "text-emerald-600")}>
                                {vr.curr_rate != null ? `₹${Number(vr.curr_rate).toFixed(2)}` : "—"}
                              </span>
                              {isBest && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
                                  Best
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">
                                {vr.moq != null ? `${Math.round(Number(vr.moq))} ${fmt(vr.uom)}` : "—"}
                              </span>
                              {isLowestMoq && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  Lowest
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge variant={vr.status === "active" ? "default" : "secondary"} className="capitalize">
                              {vr.status ?? "—"}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-sm text-muted-foreground">
                            {fmtDate(vr.effective_from)}
                          </TableCell>

                          <TableCell className="text-sm text-muted-foreground">
                            {fmtDate(vr.effective_to)}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              {bestRateRow && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs text-emerald-700 font-medium mb-1">Best Rate</p>
                  <p className="text-2xl font-bold text-emerald-600">₹{Number(bestRateRow.curr_rate).toFixed(2)}</p>
                  <p className="text-xs text-emerald-700 mt-0.5">{fmt(bestRateRow.vendor_code)}</p>
                </div>
              )}
              {lowestMoqRow && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Lowest MOQ</p>
                  <p className="text-2xl font-bold">{Math.round(Number(lowestMoqRow.moq))} <span className="text-sm font-normal uppercase">{fmt(lowestMoqRow.uom)}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">{fmt(lowestMoqRow.vendor_code)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
