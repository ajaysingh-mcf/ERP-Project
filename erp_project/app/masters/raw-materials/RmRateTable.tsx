"use client"

/**
 * Shared, reusable table core for the Raw Materials rate views.
 *
 * Both child components (VendorRawMaterialsClient / ManufacturerRawMaterialsClient)
 * render THIS and pass their own rows + column config. This component owns:
 *   - URL-synced search (UrlSearchInput, 350 ms debounce)
 *   - URL-driven status filter (select → navigate → server re-render)
 *   - Client-side sort within the current page (click column header)
 *   - PaginationBar footer (prev/next, page-size selector)
 *   - CsvImportDialog + AddRawMaterialWizard actions
 *
 * The `rows` prop is already filtered + sliced by the server (DB LIMIT/OFFSET).
 * Client-side sort applies on top of that to order within the current page.
 */

import { useMemo, useState, type ReactNode } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import type { MasterField } from "@/components/masters/field-config"
import { AddRawMaterialWizard } from "./AddRawMaterialWizard"
import type { Vendor, Mfg } from "@/types/masters"

/* ────────────────────────── Column config ──────────────────────────────────
 * A view = an ordered list of ColumnDef. Header + body are generated from the
 * SAME list, so they can never drift out of sync. Rows are read generically
 * (string-keyed) because the two views have different shapes.
 * ────────────────────────────────────────────────────────────────────────── */
export type AnyRow = Record<string, unknown>
export type ColumnDef = {
  key: string
  label: string
  sortAs: "text" | "num" | "date"
  className?: string
  render?: (row: AnyRow) => ReactNode
}

// ── Shared cell helpers reused by both column configs ───────────────────────
export const fmtDate = (v: unknown) =>
  v ? new Date(v as string).toLocaleDateString("en-CA") : "—"

export const statusBadge = (row: AnyRow) => (
  <Badge
    variant={row.status === "active" ? "success" : "secondary"}
    className="capitalize"
  >
    {(row.status as string) ?? "—"}
  </Badge>
)

// ── RM form fields (shared by Add dialog and CSV importer) ──────────────────
// Targets the `rm` table itself — the same regardless of which rate view is active.
const RM_FIELDS: MasterField[] = [
  { key: "rm_code",   label: "RM Code",   aliases: ["code"], placeholder: "e.g. RM-001",     sample: "RM-001" },
  { key: "name",      label: "Name",      required: true,    placeholder: "Material name",    sample: "Glycerin" },
  { key: "make",      label: "Make",                         placeholder: "Make",             sample: "Brand X" },
  { key: "type",      label: "Type",                         placeholder: "Type",             sample: "Liquid" },
  { key: "uom",       label: "UOM",                          placeholder: "e.g. kg",          sample: "kg" },
  {
    key: "status", label: "Status", type: "select", default: "active", colSpan: 2, sample: "active",
    options: [
      { value: "active",       label: "Active"       },
      { value: "discontinued", label: "Discontinued" },
    ],
  },
  { key: "hsn_code",  label: "HSN Code",  placeholder: "e.g. 33081000",  sample: "33081000" },
  { key: "inci_name", label: "INCI Name", placeholder: "e.g. Glycerin",  sample: "Glycerin" },
]

// ── Component ───────────────────────────────────────────────────────────────

export function RmRateTable({
  rows,
  columns,
  actionColumn,
  vendors,
  manufacturers,
  total,
  page,
  pageSize,
  currentSearch,
  currentStatus,
}: {
  rows: AnyRow[]
  columns: ColumnDef[]
  actionColumn?: (row: AnyRow) => ReactNode
  vendors: Vendor[]
  manufacturers: Mfg[]
  // Pagination + filter state from the server (URL-driven):
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentStatus: string
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // Client-side sort state (sorts within the current DB page only).
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  // Click a header: same column → flip direction; new column → sort ascending.
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  /**
   * Merge URL-param overrides, reset to page 1, then navigate.
   * Preserves ?view= so switching status/search doesn't flip vendor ↔ mfg view.
   */
  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else   params.delete(k)
    }
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  // Sort within current page — rows are already DB-filtered and sliced by the server.
  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    const dir = sortDir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      // Empty/null values always sink to the bottom, regardless of direction.
      const aEmpty = av === null || av === undefined || av === ""
      const bEmpty = bv === null || bv === undefined || bv === ""
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      let cmp = 0
      if (col?.sortAs === "num") {
        cmp = Number(av) - Number(bv)
      } else if (col?.sortAs === "date") {
        cmp = new Date(av as string).getTime() - new Date(bv as string).getTime()
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      }
      return cmp * dir
    })
  }, [rows, columns, sortKey, sortDir])

  const hasFilters = currentSearch || currentStatus
  // router.refresh() re-runs the server page with current URL — keeps page + filters.
  const refresh    = () => router.refresh()

  return (
    <>
      {/* ── Toolbar ── */}
      <MasterToolbar>
        <UrlSearchInput
          initialValue={currentSearch}
          placeholder="Search by code, name, make…"
        />

        <select
          value={currentStatus || "all"}
          onChange={(e) =>
            navigate({ status: e.target.value === "all" ? "" : e.target.value })
          }
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="discontinued">Discontinued</option>
        </select>

        <MasterToolbarActions>
          <CsvImportDialog
            entityLabel="Raw Material"
            entityLabelPlural="Raw Materials"
            endpoint="/api/masters/raw-materials"
            templateFilename="raw_material_template.csv"
            fields={RM_FIELDS}
            onSuccess={refresh}
          />
          <AddRawMaterialWizard
            vendors={vendors}
            manufacturers={manufacturers}
            onSuccess={refresh}
          />
        </MasterToolbarActions>
      </MasterToolbar>

      {/* ── Table card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {total} record{total !== 1 ? "s" : ""}
            {hasFilters && (
              <button
                onClick={() => navigate({ search: "", status: "" })}
                className="ml-2 text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* whitespace-nowrap keeps every column on a single line; the Table's
              own overflow-x wrapper lets the grid scroll sideways instead. */}
          <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
            <TableHeader>
              <TableRow>
                {columns.map((col) => {
                  const active = sortKey === col.key
                  return (
                    <TableHead key={col.key} className="bg-gray-200 font-medium text-muted-foreground">
                      {/* Whole header is a button so clicking anywhere sorts it. */}
                      <button
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                      >
                        {col.label}
                        {active ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          // Faint icon on inactive columns hints they are sortable.
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                  )
                })}
                {actionColumn && <TableHead className="bg-gray-200 w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (actionColumn ? 1 : 0)}
                    className="text-center text-muted-foreground py-10"
                  >
                    {hasFilters
                      ? "No raw materials match your filters."
                      : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row, index) => (
                  <TableRow
                    key={index}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-200"}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={col.className ?? "text-muted-foreground"}
                      >
                        {col.render
                          ? col.render(row)
                          : ((row[col.key] as ReactNode) ?? "—")}
                      </TableCell>
                    ))}
                    {actionColumn && (
                      <TableCell>{actionColumn(row)}</TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <PaginationBar total={total} page={page} pageSize={pageSize} />
        </CardContent>
      </Card>
    </>
  )
}
