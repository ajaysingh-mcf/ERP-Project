"use client"

/**
 * CLIENT component for /masters/bom-master.
 *
 * Receives a paginated BOM slice from the server page. Owns all interactive
 * behaviour: URL-synced search, material-type filter, BOM-status filter,
 * Add/CSV dialogs, and the PaginationBar footer.
 *
 * All filter changes reset to page 1 via the local navigate() helper.
 * router.refresh() after Add/CSV keeps the user on the current page.
 */

import { useState, useRef } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UrlSearchInput } from "@/components/masters/UrlSearchInput"
import { PaginationBar } from "@/components/ui/pagination-bar"
import {
  MasterToolbar,
  MasterToolbarActions,
} from "@/components/masters/MasterToolbar"
import { CsvImportDialog } from "@/components/masters/CsvImportDialog"
import { AddRecordDialog } from "@/components/masters/AddRecordDialog"
import { DownloadButton } from "@/components/masters/DownloadButton"
import { cn } from "@/lib/utils"
import type { MasterField } from "@/components/masters/field-config"
import type { BOM } from "@/types/masters"

const BOM_FIELDS: MasterField[] = [
  { key: "bom_code",      label: "BOM Code",        required: true,  placeholder: "e.g. BOM-001",   sample: "BOM-001",  colSpan: 2 },
  { key: "sku_code",      label: "SKU Code",        required: true,  placeholder: "e.g. SKU-001",   sample: "SKU-001",  colSpan: 2 },
  { key: "mfg_id",        label: "Manufacturer ID", type: "number",  required: true,  placeholder: "e.g. 1",  sample: "1" },
  {
    key: "status", label: "BOM Status", type: "select", required: false, default: "draft", sample: "draft",
    options: [
      { value: "draft",    label: "Draft"    },
      { value: "active",   label: "Active"   },
      { value: "inactive", label: "Inactive" },
    ],
  },
  {
    key: "mtrl_type", label: "Material Type", type: "select", required: true, default: "rm", sample: "rm",
    options: [
      { value: "rm", label: "RM" },
      { value: "pm", label: "PM" },
    ],
  },
  { key: "mtrl_id",       label: "Material ID",     type: "number",  required: true,  placeholder: "e.g. 10",      sample: "10" },
  { key: "amount",        label: "Amount",          type: "number",  required: true,  placeholder: "e.g. 0.5",     sample: "0.5" },
  { key: "uom",           label: "UOM",             required: false, placeholder: "e.g. kg",      sample: "kg" },
  { key: "mtrl_cost",     label: "Material Cost",   type: "number",  required: false, placeholder: "e.g. 120.00",  sample: "120.00" },
  { key: "effective_from", label: "Effective From", required: false, placeholder: "YYYY-MM-DD",   sample: "2025-01-01" },
  { key: "effective_till", label: "Effective Till", required: false, placeholder: "YYYY-MM-DD",   sample: "2025-12-31" },
]

function formatDate(val: Date | string | null) {
  if (!val) return "—"
  const d = typeof val === "string" ? new Date(val) : val
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export default function BOMMasterComponent({
  rows,
  total,
  page,
  pageSize,
  currentSearch,
  currentType,
  currentStatus,
}: {
  rows: BOM[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentType: string
  currentStatus: string
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  /** Merge URL-param overrides and reset to page 1. */
  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else   params.delete(k)
    }
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  const hasFilters = currentSearch || currentType || currentStatus
  const refresh    = () => router.refresh()

  // ── Detail panel state ────────────────────────────────────────────────────
  const [selectedRow, setSelectedRow] = useState<BOM | null>(null)
  const [rowOffset,   setRowOffset]   = useState(0)
  const leftPanelRef = useRef<HTMLDivElement>(null)

  /** Toggle selection; compute the row's Y offset relative to the card so the
   *  detail panel appears alongside the clicked row, not at the top. */
  function handleRowClick(row: BOM, e: React.MouseEvent<HTMLTableRowElement>) {
    const containerTop = leftPanelRef.current?.getBoundingClientRect().top ?? 0
    const rowTop       = e.currentTarget.getBoundingClientRect().top
    setRowOffset(Math.max(0, rowTop - containerTop))
    setSelectedRow((prev) =>
      prev?.bom_id === row.bom_id && prev?.mtrl_id === row.mtrl_id ? null : row
    )
  }

  const isSelected = (row: BOM) =>
    selectedRow?.bom_id === row.bom_id && selectedRow?.mtrl_id === row.mtrl_id

  return (
    <>
      {/* ── Toolbar ── */}
      <MasterToolbar>
        <UrlSearchInput
          initialValue={currentSearch}
          placeholder="Search by BOM code or SKU code…"
        />

        {/* Material type filter */}
        <select
          value={currentType || "all"}
          onChange={(e) =>
            navigate({ type: e.target.value === "all" ? "" : e.target.value })
          }
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Types</option>
          <option value="rm">RM</option>
          <option value="pm">PM</option>
        </select>

        {/* BOM status filter */}
        <select
          value={currentStatus || "all"}
          onChange={(e) =>
            navigate({ status: e.target.value === "all" ? "" : e.target.value })
          }
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="in review">In Review</option>
          <option value="discontinued">Discontinued</option>
        </select>

        <MasterToolbarActions>
          <DownloadButton
            endpoint="/api/masters/bom-master/export"
            label="BOM Master"
          />
          <CsvImportDialog
            entityLabel="BOM"
            entityLabelPlural="BOM entries"
            endpoint="/api/masters/bom-master"
            templateFilename="bom_template.csv"
            fields={BOM_FIELDS}
            onSuccess={refresh}
          />
          <AddRecordDialog
            entityLabel="BOM"
            endpoint="/api/masters/bom-master"
            fields={BOM_FIELDS}
            onSuccess={refresh}
          />
        </MasterToolbarActions>
      </MasterToolbar>

      {/* ── Split-panel layout ── */}
      <div className="flex gap-4 items-start">

        {/* ── Main table — narrows when detail panel is open ── */}
        <div
          ref={leftPanelRef}
          className={cn(
            "min-w-0 transition-all duration-300 ease-in-out",
            selectedRow ? "w-[58%] shrink-0" : "w-full"
          )}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {total} record{total !== 1 ? "s" : ""}
                {hasFilters && (
                  <button
                    onClick={() => navigate({ search: "", type: "", status: "" })}
                    className="ml-2 text-xs text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BOM Code</TableHead>
                    <TableHead>Material ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Effective From</TableHead>
                    <TableHead>BOM Status</TableHead>
                    <TableHead>Material Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        {hasFilters ? "No BOM records match your filters." : "No records found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, i) => (
                      <TableRow
                        key={`${row.bom_id}-${row.mtrl_id}-${i}`}
                        onClick={(e) => handleRowClick(row, e)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isSelected(row)
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <TableCell className="font-mono text-xs font-medium">{row.bom_code ?? "—"}</TableCell>
                        <TableCell>{row.mtrl_id ?? "—"}</TableCell>
                        <TableCell>
                          {row.mtrl_type ? (
                            <Badge variant="outline" className="uppercase text-xs">{row.mtrl_type}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{row.uom ?? "—"}</TableCell>
                        <TableCell>{row.amount ?? "—"}</TableCell>
                        <TableCell className="text-sm">{formatDate(row.effective_from)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={row.bom_status === "active" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {row.bom_status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.material_status === "active" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {row.material_status ?? "—"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <PaginationBar total={total} page={page} pageSize={pageSize} />
            </CardContent>
          </Card>
        </div>

        {/* ── Detail panel — slides in when a row is selected ── */}
        <div
          className={cn(
            "min-w-0 overflow-hidden transition-all duration-300 ease-in-out",
            selectedRow ? "flex-1 opacity-100" : "w-0 flex-none opacity-0"
          )}
          style={{ marginTop: rowOffset }}
        >
          {selectedRow && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold font-mono">
                      {selectedRow.bom_code}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">BOM Detail</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 -mt-1 -mr-1"
                    onClick={() => setSelectedRow(null)}
                    title="Close detail panel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* ── Key fields summary ── */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">SKU Code</p>
                    <p className="font-mono font-medium mt-0.5">{selectedRow.sku_code ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Material Type</p>
                    <div className="mt-1">
                      <Badge variant="outline" className="uppercase text-xs">
                        {selectedRow.mtrl_type ?? "—"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Material ID</p>
                    <p className="font-medium mt-0.5">{selectedRow.mtrl_id ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-medium mt-0.5">
                      {selectedRow.amount ?? "—"}
                      {selectedRow.uom ? <span className="text-muted-foreground ml-1 text-xs uppercase">{selectedRow.uom}</span> : null}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Effective From</p>
                    <p className="font-medium mt-0.5">{formatDate(selectedRow.effective_from)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Effective Till</p>
                    <p className="font-medium mt-0.5">{formatDate(selectedRow.effective_till)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">BOM Status</p>
                    <div className="mt-1">
                      <Badge
                        variant={selectedRow.bom_status === "active" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {selectedRow.bom_status ?? "—"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Material Status</p>
                    <div className="mt-1">
                      <Badge
                        variant={selectedRow.material_status === "active" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {selectedRow.material_status ?? "—"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* ── Placeholder for upcoming detail data ── */}
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm font-medium text-muted-foreground">More details coming soon</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Additional information will appear here
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

      </div>
    </>
  )
}
