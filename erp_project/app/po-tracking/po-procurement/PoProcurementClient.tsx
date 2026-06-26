"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Filter, Plus, Upload } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SearchInput } from "@/components/masters/SearchInput"
import { cn } from "@/lib/utils"

import type { MfgOption, PoRow, SkuOption, TabKey, WarehouseOption } from "./po-types"
import { PAGE_SIZE, STATUS_CONFIG, STATUS_KEYS, TABS } from "./po-types"
import { fmtInt, fmtMoney, getPageNumbers, num } from "./po-utils"
import PoTable from "./PoTable"
import AddPODialog from "./AddPODialog"
import ImpromptuPODialog from "./ImpromptuPODialog"
import PoBulkUploadDialog from "./PoBulkUploadDialog"
import SplitPODialog from "./SplitPODialog"

/* ── Summary card ────────────────────────────────────────────────────────────── */

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-lg font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  )
}

/* ── Pagination bar ──────────────────────────────────────────────────────────── */

function PoPagination({
  total, safePage, totalPages, firstItem, lastItem, onChange,
}: {
  total: number
  safePage: number
  totalPages: number
  firstItem: number
  lastItem: number
  onChange: (page: number) => void
}) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-4 px-1">
      <p className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        Showing {firstItem}–{lastItem} of {total} result{total !== 1 ? "s" : ""}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input text-xs hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
            aria-label="Previous page"
          >‹</button>

          {getPageNumbers(safePage, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`el-${i}`} className="h-7 w-7 flex items-center justify-center text-muted-foreground text-xs select-none">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p as number)}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors",
                  safePage === p
                    ? "border-foreground bg-foreground text-background font-semibold"
                    : "border-input hover:bg-accent"
                )}
              >{p}</button>
            )
          )}

          <button
            onClick={() => onChange(Math.min(totalPages, safePage + 1))}
            disabled={safePage === totalPages}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input text-xs hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
            aria-label="Next page"
          >›</button>
        </div>
      )}
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────────── */

export default function PoProcurementClient({
  initialRows,
  skuOptions,
  mfgOptions,
  warehouseOptions,
  sessionUserId,
}: {
  initialRows: PoRow[]
  skuOptions: SkuOption[]
  mfgOptions: MfgOption[]
  warehouseOptions: WarehouseOption[]
  sessionUserId: number
}) {
  const router = useRouter()

  const [search, setSearch]               = useState("")
  const [activeTab, setActiveTab]         = useState<TabKey>("all")
  const [currentPage, setCurrentPage]     = useState(1)
  const [showAddPO, setShowAddPO]         = useState(false)
  const [showBulk, setShowBulk]           = useState(false)
  const [showImpromptu, setShowImpromptu] = useState(false)
  const [editTarget, setEditTarget]       = useState<PoRow | null>(null)
  const [splitTarget, setSplitTarget]     = useState<PoRow | null>(null)

  useEffect(() => { setCurrentPage(1) }, [search, activeTab])

  /* ── Filtering ── */

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return initialRows
    return initialRows.filter((r) =>
      [r.po_no, r.mfg_name, r.mfg_code, r.sku_code, r.sku_name]
        .some((f) => (f ?? "").toLowerCase().includes(q))
    )
  }, [initialRows, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: searchFiltered.length }
    for (const k of STATUS_KEYS) c[k] = 0
    for (const r of searchFiltered) {
      const s = r.status ?? "draft"
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [searchFiltered])

  const visibleRows = useMemo(
    () => activeTab === "all" ? searchFiltered : searchFiltered.filter((r) => r.status === activeTab),
    [searchFiltered, activeTab]
  )

  /* ── Pagination ── */

  const totalPages    = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const safePage      = Math.min(currentPage, totalPages)
  const paginatedRows = useMemo(
    () => visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleRows, safePage]
  )
  const firstItem = visibleRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const lastItem  = Math.min(safePage * PAGE_SIZE, visibleRows.length)

  /* ── Summary ── */

  const summary = useMemo(() => {
    const by = (s: string) => initialRows.filter((r) => r.status === s).length
    const openValue = initialRows
      .filter((r) => r.status !== "received" && r.status !== "cancelled")
      .reduce((sum, r) => sum + num(r.total_amount), 0)
    return {
      total: initialRows.length,
      raised: by("raised"),
      punched: by("punched"),
      partiallyReceived: by("partially_received"),
      openValue,
    }
  }, [initialRows])

  const afterAction = () => router.refresh()

  return (
    <div className="space-y-4 text-xs [&_th]:h-9 [&_th]:px-3 [&_th]:text-[11px] [&_td]:px-3 [&_td]:py-2">

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search PO, SKU, MFG…" />
        <button
          onClick={() => console.log("TODO: filters")}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-accent transition-colors"
        >
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>
        <button
          onClick={() => setShowBulk(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-accent transition-colors"
        >
          <Upload className="h-3.5 w-3.5" /> Bulk Upload
        </button>
        <button
          onClick={() => setShowAddPO(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors sm:ml-auto"
        >
          <Plus className="h-3.5 w-3.5" /> Add PO
        </button>
      </div>

      {/* ── Status tabs ── */}
      <Card className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
        <CardContent className="p-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {tab === "all" ? "All" : STATUS_CONFIG[tab].label}{" "}
                <span className="opacity-70">({counts[tab] ?? 0})</span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <PoTable
        rows={paginatedRows}
        sessionUserId={sessionUserId}
        onEdit={setEditTarget}
        onSplit={setSplitTarget}
      />

      {/* ── Pagination ── */}
      <PoPagination
        total={visibleRows.length}
        safePage={safePage}
        totalPages={totalPages}
        firstItem={firstItem}
        lastItem={lastItem}
        onChange={setCurrentPage}
      />

      {/* ── Summary cards ── */}
      <div className="text-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <SummaryCard label="Total POs"          value={fmtInt(summary.total)} />
        <SummaryCard label="Raised"             value={fmtInt(summary.raised)} />
        <SummaryCard label="Punched"            value={fmtInt(summary.punched)} />
        <SummaryCard label="Partially Received" value={fmtInt(summary.partiallyReceived)} />
        <SummaryCard label="Value of Open POs"  value={fmtMoney(summary.openValue)} />
      </div>

      {/* ── Dialogs ── */}
      <AddPODialog
        open={showAddPO}
        onClose={() => setShowAddPO(false)}
        skuOptions={skuOptions}
        mfgOptions={mfgOptions}
        warehouseOptions={warehouseOptions}
        onCreated={afterAction}
      />

      <PoBulkUploadDialog
        open={showBulk}
        onClose={() => setShowBulk(false)}
        onSubmitted={afterAction}
      />

      <ImpromptuPODialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        skuOptions={skuOptions}
        mfgOptions={mfgOptions}
        warehouseOptions={warehouseOptions}
        onCreated={afterAction}
        editData={editTarget ? {
          id: editTarget.id,
          mfg_id: editTarget.mfg_id,
          sku_code: editTarget.sku_code ?? "",
          qty: editTarget.qty,
          expected_on: editTarget.expected_on,
          destination: editTarget.destination,
        } : null}
      />

      <SplitPODialog
        open={splitTarget !== null}
        onClose={() => setSplitTarget(null)}
        po={splitTarget}
        warehouseOptions={warehouseOptions}
        onSplit={afterAction}
      />
    </div>
  )
}
