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

import { useMemo, useState, useEffect, useRef, type ReactNode } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { ArrowUp, ArrowDown, ChevronsUpDown, SlidersHorizontal, X } from "lucide-react"
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
import { DownloadButton } from "@/components/masters/DownloadButton"
import { AddRawMaterialWizard } from "./AddRawMaterialWizard"
import { RM_VRM_BULK_FIELDS } from "./rm-vrm-bulk-fields"
import { RM_MRM_BULK_FIELDS } from "./rm-mrm-bulk-fields"
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
  // Vendor-specific filter props (not rendered by mfg view):
  currentMake,
  makes,
  currentVendorCode,
  currentRateMin,
  currentRateMax,
  currentEffectiveFrom,
  // Shared type filter:
  currentType,
  types,
  // Mfg-specific filter props (not rendered by vendor view):
  currentMfgCode,
  currentMfgRateMin,
  currentMfgRateMax,
  currentMfgEffectiveFrom,
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
  // Vendor-specific filter props (omit for mfg view):
  currentMake?: string
  makes?: string[]
  currentVendorCode?: string
  currentRateMin?: string
  currentRateMax?: string
  currentEffectiveFrom?: string
  // Shared type filter (available in both views):
  currentType?: string
  types?: string[]
  // Mfg-specific filter props (omit for vendor view):
  currentMfgCode?: string
  currentMfgRateMin?: string
  currentMfgRateMax?: string
  currentMfgEffectiveFrom?: string
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // Only the mfg view passes currentMfgCode — distinguishes which rate-bulk
  // CSV (vendor vs manufacturer) the toolbar should offer.
  const isMfgView = currentMfgCode !== undefined

  // Client-side sort state (sorts within the current DB page only).
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  // Filter panel open/close.
  const [showFilters, setShowFilters] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close panel on outside click.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowFilters(false)
      }
    }
    if (showFilters) document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [showFilters])

  // Draft filter state — every filter control below only updates these
  // locally; the actual server refetch fires only when "Apply" is clicked.
  const [localVendorCode, setLocalVendorCode] = useState(currentVendorCode ?? "")
  const [localRateMin, setLocalRateMin]       = useState(currentRateMin ?? "")
  const [localRateMax, setLocalRateMax]       = useState(currentRateMax ?? "")
  const [draftStatus, setDraftStatus]         = useState(currentStatus ?? "")
  const [draftType, setDraftType]             = useState(currentType ?? "")
  const [draftMake, setDraftMake]             = useState(currentMake ?? "")
  const [draftEffectiveFrom, setDraftEffectiveFrom] = useState(currentEffectiveFrom ?? "")

  // Sync draft state when URL-driven prop changes (e.g. Clear filters).
  useEffect(() => { setLocalVendorCode(currentVendorCode ?? "") }, [currentVendorCode])
  useEffect(() => { setLocalRateMin(currentRateMin ?? "") }, [currentRateMin])
  useEffect(() => { setLocalRateMax(currentRateMax ?? "") }, [currentRateMax])
  useEffect(() => { setDraftStatus(currentStatus ?? "") }, [currentStatus])
  useEffect(() => { setDraftType(currentType ?? "") }, [currentType])
  useEffect(() => { setDraftMake(currentMake ?? "") }, [currentMake])
  useEffect(() => { setDraftEffectiveFrom(currentEffectiveFrom ?? "") }, [currentEffectiveFrom])

  // Draft state for mfg filter inputs.
  const [localMfgCode, setLocalMfgCode]       = useState(currentMfgCode ?? "")
  const [localMfgRateMin, setLocalMfgRateMin] = useState(currentMfgRateMin ?? "")
  const [localMfgRateMax, setLocalMfgRateMax] = useState(currentMfgRateMax ?? "")
  const [draftMfgEffectiveFrom, setDraftMfgEffectiveFrom] = useState(currentMfgEffectiveFrom ?? "")
  useEffect(() => { setLocalMfgCode(currentMfgCode ?? "") }, [currentMfgCode])
  useEffect(() => { setLocalMfgRateMin(currentMfgRateMin ?? "") }, [currentMfgRateMin])
  useEffect(() => { setLocalMfgRateMax(currentMfgRateMax ?? "") }, [currentMfgRateMax])
  useEffect(() => { setDraftMfgEffectiveFrom(currentMfgEffectiveFrom ?? "") }, [currentMfgEffectiveFrom])

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
    || currentMake || currentVendorCode || currentRateMin || currentRateMax || currentEffectiveFrom
    || currentType
    || currentMfgCode || currentMfgRateMin || currentMfgRateMax || currentMfgEffectiveFrom
  const refresh    = () => router.refresh()

  // Commits every draft filter value to the URL in one navigation.
  function applyFilters() {
    navigate({
      status: draftStatus,
      type: draftType,
      make: draftMake,
      vendor_code: localVendorCode,
      rate_min: localRateMin,
      rate_max: localRateMax,
      effective_from: draftEffectiveFrom,
      mfg_code: localMfgCode,
      mfg_rate_min: localMfgRateMin,
      mfg_rate_max: localMfgRateMax,
      mfg_effective_from: draftMfgEffectiveFrom,
    })
    setShowFilters(false)
  }

  function clearAllFilters() {
    setDraftStatus("")
    setDraftType("")
    setDraftMake("")
    setLocalVendorCode("")
    setLocalRateMin("")
    setLocalRateMax("")
    setDraftEffectiveFrom("")
    setLocalMfgCode("")
    setLocalMfgRateMin("")
    setLocalMfgRateMax("")
    setDraftMfgEffectiveFrom("")
    navigate({ status: "", type: "", make: "", vendor_code: "", rate_min: "", rate_max: "", effective_from: "", mfg_code: "", mfg_rate_min: "", mfg_rate_max: "", mfg_effective_from: "" })
    setShowFilters(false)
  }

  // Count of active non-search filters (drives badge on Filters button).
  const activeFilterCount = [
    currentStatus,
    currentMake,
    currentVendorCode,
    currentRateMin,
    currentRateMax,
    currentEffectiveFrom,
    currentType,
    currentMfgCode,
    currentMfgRateMin,
    currentMfgRateMax,
    currentMfgEffectiveFrom,
  ].filter(Boolean).length

  const inputCls = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:[color-scheme:dark]"
  const selectCls = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

  return (
    <>
      {/* ── Toolbar ── */}
      <MasterToolbar>
        <UrlSearchInput
          initialValue={currentSearch}
          placeholder="Search by code, name, make…"
        />

        {/* ── Filters button + floating panel ── */}
        <div ref={panelRef} className="relative">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-2 backdrop-blur-xs h-9 px-3 rounded-lg border text-sm font-medium transition-colors
              ${showFilters || activeFilterCount > 0
                ? "border-primary bg-primary/5 text-primary"
                : "border-input bg-background text-foreground hover:bg-muted"
              }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showFilters && (
            <div className="absolute left-0 top-11 z-50 w-72 rounded-xl border border-border bg-background shadow-lg ring-1 ring-black/5">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold">Filters</span>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                  <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Status */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
                  <select
                    value={draftStatus || "all"}
                    onChange={(e) => setDraftStatus(e.target.value === "all" ? "" : e.target.value)}
                    className={selectCls}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="discontinued">Discontinued</option>
                  </select>
                </div>

                {/* Type filter — visible in both vendor and mfg views */}
                {types !== undefined && types.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</label>
                    <select
                      value={draftType || "all"}
                      onChange={(e) => setDraftType(e.target.value === "all" ? "" : e.target.value)}
                      className={selectCls}
                    >
                      <option value="all">All Types</option>
                      {types.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Vendor-only filters */}
                {makes !== undefined && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Make</label>
                      <select
                        value={draftMake || "all"}
                        onChange={(e) => setDraftMake(e.target.value === "all" ? "" : e.target.value)}
                        className={selectCls}
                      >
                        <option value="all">All Makes</option>
                        {makes.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor Code</label>
                      <input
                        type="text"
                        value={localVendorCode}
                        placeholder="e.g. VEN-001"
                        onChange={(e) => setLocalVendorCode(e.target.value)}
                        className={inputCls}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate Range (₹)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={localRateMin}
                          placeholder="Min"
                          min={0}
                          onChange={(e) => setLocalRateMin(e.target.value)}
                          className={inputCls}
                        />
                        <span className="text-muted-foreground text-sm">–</span>
                        <input
                          type="number"
                          value={localRateMax}
                          placeholder="Max"
                          min={0}
                          onChange={(e) => setLocalRateMax(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Effective From</label>
                      <input
                        type="date"
                        value={draftEffectiveFrom}
                        onChange={(e) => setDraftEffectiveFrom(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </>
                )}

                {/* Mfg-only filters */}
                {currentMfgCode !== undefined && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">MFG Code</label>
                      <input
                        type="text"
                        value={localMfgCode}
                        placeholder="e.g. MFG-001"
                        onChange={(e) => setLocalMfgCode(e.target.value)}
                        className={inputCls}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate Range (₹)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={localMfgRateMin}
                          placeholder="Min"
                          min={0}
                          onChange={(e) => setLocalMfgRateMin(e.target.value)}
                          className={inputCls}
                        />
                        <span className="text-muted-foreground text-sm">–</span>
                        <input
                          type="number"
                          value={localMfgRateMax}
                          placeholder="Max"
                          min={0}
                          onChange={(e) => setLocalMfgRateMax(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Effective From</label>
                      <input
                        type="date"
                        value={draftMfgEffectiveFrom}
                        onChange={(e) => setDraftMfgEffectiveFrom(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Panel footer */}
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
                <button
                  onClick={() => setShowFilters(false)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 text-xs hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={applyFilters}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <MasterToolbarActions>
          <DownloadButton
            endpoint="/api/masters/raw-materials/export"
            label="Raw Materials"
          />
          {isMfgView ? (
            <CsvImportDialog
              entityLabel="Manufacturer Rate"
              entityLabelPlural="Manufacturer Rates"
              endpoint="/api/masters/raw-materials/mrm-bulk"
              templateFilename="rm_manufacturer_rate_template.csv"
              fields={RM_MRM_BULK_FIELDS}
              enableDuplicateCheck
              requireAllValid
              onSuccess={refresh}
            />
          ) : (
            <CsvImportDialog
              entityLabel="Vendor Rate"
              entityLabelPlural="Vendor Rates"
              endpoint="/api/masters/raw-materials/vrm-bulk"
              templateFilename="rm_vendor_rate_template.csv"
              fields={RM_VRM_BULK_FIELDS}
              enableDuplicateCheck
              requireAllValid
              onSuccess={refresh}
            />
          )}
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
                onClick={() => navigate({ search: "", status: "", type: "", make: "", vendor_code: "", rate_min: "", rate_max: "", effective_from: "", mfg_code: "", mfg_rate_min: "", mfg_rate_max: "", mfg_effective_from: "" })}
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
                    <TableHead key={col.key} className="bg-muted/50 font-medium text-muted-foreground">
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
                {actionColumn && <TableHead className="bg-muted/50 w-10" />}
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
                    className={index % 2 === 0 ? "bg-background" : "bg-muted/40"}
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
