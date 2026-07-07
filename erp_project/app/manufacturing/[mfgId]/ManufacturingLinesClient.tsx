"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { MfgLine, MfgLineStatus } from "@/types/masters"
import { fmtDate, fmtInt } from "../mfg-utils"
import LineDialog, { type BomOption } from "./LineDialog"

const TABS: { key: MfgLineStatus; label: string }[] = [
  { key: "active", label: "Active Manufacturing" },
  { key: "on_hold", label: "Stopped / On Hold" },
  { key: "tech_transfer", label: "Tech Transfers" },
]

const STATUS_BADGE: Record<MfgLineStatus, { label: string; variant: "success" | "warning" | "secondary" }> = {
  active: { label: "Active", variant: "success" },
  on_hold: { label: "On Hold", variant: "warning" },
  tech_transfer: { label: "Tech Transfer", variant: "secondary" },
}

export default function ManufacturingLinesClient({
  mfgId,
  rows,
  statusCounts,
  currentTab,
  bomOptions,
}: {
  mfgId: number
  rows: MfgLine[]
  statusCounts: Record<string, number>
  currentTab: MfgLineStatus
  bomOptions: BomOption[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [dialogTarget, setDialogTarget] = useState<MfgLine | null | "new">(null)

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      (r.sku_code ?? "").toLowerCase().includes(q) ||
      (r.sku_name ?? "").toLowerCase().includes(q) ||
      (r.bom_code ?? "").toLowerCase().includes(q)
    )
  }, [rows, search])

  const total = Object.values(statusCounts).reduce((s, n) => s + n, 0)
  const afterAction = () => { setDialogTarget(null); router.refresh() }

  return (
    <div className="space-y-4 text-xs">
      {/* ── Status tabs ── */}
      <Card className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
        <CardContent className="p-0 flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => router.push(`/manufacturing/${mfgId}?tab=${tab.key}`)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                (currentTab === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground")
              }
            >
              {tab.label} <span className="opacity-70">({statusCounts[tab.key] ?? 0})</span>
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground self-center pr-2">{total} total lines</span>
        </CardContent>
      </Card>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU, MFG…"
          className="flex h-9 w-full sm:max-w-xs rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={() => setDialogTarget("new")}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors sm:ml-auto"
        >
          <Plus className="h-3.5 w-3.5" /> Add Line
        </button>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>BOM</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead className="text-right">Monthly Capacity</TableHead>
                  <TableHead className="text-right">This Month Plan</TableHead>
                  <TableHead>Active Since</TableHead>
                  <TableHead>Last Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                      No manufacturing lines match this view.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => {
                    const cfg = STATUS_BADGE[r.status] ?? { label: r.status, variant: "secondary" as const }
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-mono text-xs font-medium">{r.sku_code ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground max-w-40 truncate">{r.sku_name ?? ""}</div>
                        </TableCell>
                        <TableCell>{r.brand ?? "—"}</TableCell>
                        <TableCell className="font-mono">{r.bom_code ?? "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.mfg_name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{r.mfg_code}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(r.monthly_capacity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(r.this_month_plan)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.effective_from)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.last_batch_date)}</TableCell>
                        <TableCell><Badge variant={cfg.variant}>{cfg.label}</Badge></TableCell>
                        <TableCell className="max-w-40 truncate">{r.remarks ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => setDialogTarget(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent transition-colors"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
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

      <LineDialog
        open={dialogTarget !== null}
        onClose={() => setDialogTarget(null)}
        onSaved={afterAction}
        mfgId={mfgId}
        bomOptions={bomOptions}
        editData={dialogTarget && dialogTarget !== "new" ? dialogTarget : null}
      />
    </div>
  )
}
