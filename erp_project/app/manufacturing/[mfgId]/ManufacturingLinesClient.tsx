"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { DownloadButton } from "@/components/masters/DownloadButton"
import type { MfgLine, MfgLineStatus } from "@/types/masters"
import { fmtDate } from "../mfg-utils"
import LineDialog, { type BomOption } from "./LineDialog"

function fmtFilling(filling: number | null, uom: string | null) {
  if (filling == null) return "—"
  return uom ? `${filling} ${uom}` : String(filling)
}

export default function ManufacturingLinesClient({
  mfgId,
  rows,
  currentTab,
  bomOptions,
}: {
  mfgId: number
  rows: MfgLine[]
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

  const afterAction = () => { setDialogTarget(null); router.refresh() }

  return (
    <div className="space-y-4 text-xs">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU, BOM…"
          className="flex h-9 w-full sm:max-w-xs rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {currentTab === "active" && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <DownloadButton
              endpoint={`/api/manufacturing/${mfgId}/lines/active/export`}
              label="Active Manufacturing"
            />
            <button
              onClick={() => setDialogTarget("new")}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add SKUs
            </button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>BOM Code</TableHead>
                  <TableHead>SKU Name</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                  <TableHead>Filling</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No manufacturing lines match this view.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.sku_code ?? "—"}</TableCell>
                      <TableCell className="font-mono">{r.bom_code ?? "—"}</TableCell>
                      <TableCell className="max-w-40 truncate">{r.sku_name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(r.effective_from)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(r.effective_to)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtFilling(r.filling, r.filling_uom)}</TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => setDialogTarget(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent transition-colors"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
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
