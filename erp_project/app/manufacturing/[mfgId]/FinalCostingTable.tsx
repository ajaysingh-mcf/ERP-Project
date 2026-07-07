"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { FinalCostingRow } from "@/types/masters"
import { fmtMoney } from "../mfg-utils"

export default function FinalCostingTable({ rows }: { rows: FinalCostingRow[] }) {
  return (
    <div className="space-y-2 text-xs">
      <p className="text-[11px] text-muted-foreground">
        Total = (RM + PM) × 1.10 (10% wastage tolerance on materials) + JW + Shrink Wrap + Shipper.
      </p>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>SKU Name</TableHead>
                  <TableHead className="text-right">RM Cost</TableHead>
                  <TableHead className="text-right">PM Cost</TableHead>
                  <TableHead className="text-right">JWW</TableHead>
                  <TableHead className="text-right">Shrinkage</TableHead>
                  <TableHead className="text-right">Shipper</TableHead>
                  <TableHead className="text-right">Wastage (10%)</TableHead>
                  <TableHead className="text-right">Total Costing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                      No active SKUs to cost yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.bom_id}>
                      <TableCell className="font-mono">{r.sku_code ?? "—"}</TableCell>
                      <TableCell className="max-w-40 truncate">{r.sku_name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.rm_cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.pm_cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.jw)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.shrink)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.shipper)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.wastage)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
