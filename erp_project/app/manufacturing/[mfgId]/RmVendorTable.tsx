"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { RmVendorHistoryRow, RmVendorRow } from "@/types/masters"
import { fmtDate, fmtMoney } from "../mfg-utils"

export default function RmVendorTable({
  rows, historyRows,
}: {
  rows: RmVendorRow[]
  historyRows: RmVendorHistoryRow[]
}) {
  return (
    <div className="space-y-4 text-xs">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RM Code</TableHead>
                  <TableHead>RM Name</TableHead>
                  <TableHead>Make</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vendor Code</TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-10 text-xs">
                      No RM agreed to this manufacturer yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.rm_code ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-40 truncate">{r.rm_name}</TableCell>
                      <TableCell className="text-xs">{r.make ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.type ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.approved_vendor_code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.vendor_name ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtMoney(r.curr_rate)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.effective_from)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">Ongoing</TableCell>
                      <TableCell><Badge variant={r.status === "active" ? "success" : "secondary"} className="capitalize">{r.status}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="mb-2 text-sm font-semibold">Rate History</div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RM Code</TableHead>
                    <TableHead>RM Name</TableHead>
                    <TableHead>Vendor Name</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Effective From</TableHead>
                    <TableHead>Effective To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-10 text-xs">
                        No superseded rates yet — every rate change is archived here.
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.rm_code ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-40 truncate">{r.rm_name}</TableCell>
                        <TableCell className="text-xs">{r.vendor_name ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{fmtMoney(r.rate)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.effective_from)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.effective_to)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
