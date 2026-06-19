"use client"

/**
 * CLIENT component for /po-tracking/po-procurement.
 *
 * Receives the joined PO rows from the server page (PoProcurementPage) as
 * `initialRows` and owns ALL interactivity. The page has four visual blocks,
 * top to bottom — each is its own clearly-marked section below:
 *
 *   A. "Action Required" banner  — collapsible, mock-fed (POs to be raised).
 *   B. Toolbar                   — search + Filters + Impromptu PO.
 *   C. Status tabs               — All / Open / In Production / … with counts.
 *   D. Main PO table             — the wide grid with progress bars + badges.
 *   E. Summary cards             — six headline metrics.
 *
 * Buttons that would need a backend (Raise PO, Impromptu PO, Filters, Split)
 * are intentionally UI-only this pass — they call no-op handlers marked TODO.
 */

import { useMemo, useState } from "react"
import {
  AlertTriangle, ChevronDown, ChevronUp, Plus, Filter, Zap, Scissors,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { SearchInput } from "@/components/masters/SearchInput"
import { cn } from "@/lib/utils"
import {
  PURCHASE_ORDERS,
  PENDING_PLAN_POS,
  type PoRow,
  type PendingPriority,
} from "./mock-data"

/* ────────────────────────────────────────────────────────────────────────────
 * 1. STATUS CONFIG — the single source of truth for how each PO status renders.
 *
 *   - `label`   : human-readable text shown in tabs + the status badge.
 *   - `variant` : which <Badge> colour variant to use.
 *   - The KEY ORDER here also defines the LEFT-TO-RIGHT order of the tabs.
 * ──────────────────────────────────────────────────────────────────────────── */
type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive" | "outline"

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  open:                 { label: "Open",                variant: "secondary" },
  in_production:        { label: "In Production",       variant: "default" },
  partially_dispatched: { label: "Partially Dispatched", variant: "warning" },
  fully_dispatched:     { label: "Fully Dispatched",   variant: "default" },
  received:             { label: "Received",            variant: "success" },
  cancelled:            { label: "Cancelled",           variant: "destructive" },
}

// Tab definitions: a leading "all" pseudo-status, then every real status in
// STATUS_CONFIG order.
const STATUS_KEYS = Object.keys(STATUS_CONFIG)
const TABS = ["all", ...STATUS_KEYS] as const
type TabKey = (typeof TABS)[number]

// Priority pill colours for the banner (kept local — priorities are mock-only).
const PRIORITY_STYLES: Record<PendingPriority, string> = {
  High:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Low:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. SMALL HELPERS — formatting + safe number coercion.
 *    DECIMAL columns arrive from mysql2 as strings, so coerce before any math.
 * ──────────────────────────────────────────────────────────────────────────── */
const num = (v: number | string | boolean | null | undefined): number => Number(v ?? 0) || 0

/** 12500 → "12,500" (Indian grouping). */
const fmtInt = (v: number | string | null | undefined) =>
  num(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })

/** 2740000 → "₹27.4L" (lakhs) or "₹2.7Cr" (crores) for big sums. */
const fmtMoneyShort = (v: number) => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`
  return `₹${(v / 1e5).toFixed(1)}L`
}

/** JS Date | null → "2026-05-01" (or "—"). en-CA gives ISO-style yyyy-mm-dd. */
const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-CA") : "—"

/* ────────────────────────────────────────────────────────────────────────────
 * 3. PROGRESS CELL — the little number + bar used for Dispatched / Received.
 *    `value / total` fills the bar; clamped to 100%.
 * ──────────────────────────────────────────────────────────────────────────── */
function ProgressCell({
  value, total, barClass,
}: { value: number | string | null; total: number | string; barClass: string }) {
  const v = num(value)
  const t = num(total)
  const pct = t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0
  return (
    <div className="min-w-[72px]">
      <div className="text-xs font-medium tabular-nums">{fmtInt(v)}</div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * MAIN COMPONENT
 * ──────────────────────────────────────────────────────────────────────────── */
export default function PoProcurementClient() {
  // All PO rows come from the local mock module (no DB this pass).
  const initialRows: PoRow[] = PURCHASE_ORDERS

  // --- State ----------------------------------------------------------------
  const [search, setSearch] = useState("")          // free-text filter
  const [activeTab, setActiveTab] = useState<TabKey>("all") // selected status tab
  const [bannerOpen, setBannerOpen] = useState(true) // Action-Required collapsed?

  // --- Search filtering (applied before tab + count derivation) -------------
  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return initialRows
    return initialRows.filter((r) =>
      [r.po_no, r.mfg_name, r.sku_code, r.sku_name, r.fg_code, r.bom_code]
        .some((f) => (f ?? "").toLowerCase().includes(q))
    )
  }, [initialRows, search])

  // --- Tab counts (over the search-filtered set, so they react to search) ---
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: searchFiltered.length }
    for (const key of STATUS_KEYS) c[key] = 0
    for (const r of searchFiltered) {
      if (r.status && c[r.status] !== undefined) c[r.status]++
    }
    return c
  }, [searchFiltered])

  // --- Rows actually shown = search-filtered AND matching the active tab -----
  const visibleRows = useMemo(
    () =>
      activeTab === "all"
        ? searchFiltered
        : searchFiltered.filter((r) => r.status === activeTab),
    [searchFiltered, activeTab]
  )

  // --- Summary-card figures (derived from ALL rows, not the current tab) -----
  const summary = useMemo(() => {
    const by = (s: string) => initialRows.filter((r) => r.status === s).length
    const openValue = initialRows
      .filter((r) => r.status !== "received" && r.status !== "cancelled")
      .reduce((sum, r) => sum + num(r.total_amount), 0)
    return {
      total: initialRows.length,
      open: by("open"),
      inProduction: by("in_production"),
      // "In Transit" = dispatched but not yet received.
      inTransit: by("partially_dispatched") + by("fully_dispatched"),
      received: by("received"),
      openValue,
    }
  }, [initialRows])

  // --- UI-only handlers (no backend this pass) ------------------------------
  // TODO: wire these to API routes when the PO mutation endpoints are built.
  const onRaisePO = (planId: string) => console.log("TODO: raise PO for", planId)
  const onImpromptuPO = () => console.log("TODO: open Impromptu PO dialog")
  const onFilters = () => console.log("TODO: open advanced filters")
  const onSplit = (poNo: string) => console.log("TODO: split PO", poNo)

  return (
    // Page-scoped density: smaller base text + tighter table cells. These
    // arbitrary variants only affect THIS page, not the shared Table component.
    <div className="space-y-4 text-xs [&_th]:h-9 [&_th]:px-3 [&_th]:text-[11px] [&_td]:px-3 [&_td]:py-2">
      {/* ════════════════════════════════════════════════════════════════════
          A. ACTION REQUIRED BANNER (collapsible, mock-fed).
             Shows POs the production plan wants raised. Amber accent = attention.
         ════════════════════════════════════════════════════════════════════ */}
      {PENDING_PLAN_POS.length > 0 && (
        <Card className="border-amber-300/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardContent className="p-0">
            {/* Banner header — click to collapse/expand the table beneath it. */}
            <button
              onClick={() => setBannerOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
                {PENDING_PLAN_POS.length} POs pending to be raised from Production Plan
              </span>
              <Badge variant="warning" className="ml-1">Action Required</Badge>
              <span className="ml-auto text-amber-700">
                {bannerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {/* Banner body — the pending-PO table. */}
            {bannerOpen && (
              <div className="overflow-x-auto border-t border-amber-200/70 dark:border-amber-900/40">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>SKU</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>BOM</TableHead>
                      <TableHead className="text-right">Planned Qty</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>PO Due By</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PENDING_PLAN_POS.map((p) => (
                      <TableRow key={p.id} className="hover:bg-amber-100/40 dark:hover:bg-amber-900/20">
                        <TableCell>
                          <div className="font-medium">{p.sku_code}</div>
                          <div className="text-xs text-muted-foreground">{p.sku_name}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{p.mfg_name}</div>
                          <div className="text-[11px] text-muted-foreground">{p.mfg_code}</div>
                        </TableCell>
                        <TableCell className="text-xs">{p.bom}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(p.planned_qty)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.phase}</TableCell>
                        <TableCell className="text-xs tabular-nums">{p.po_due_by}</TableCell>
                        <TableCell>
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", PRIORITY_STYLES[p.priority])}>
                            {p.priority}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => onRaisePO(p.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" /> Raise PO
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          B. TOOLBAR — search on the left, actions on the right.
         ════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search PO, SKU, MFG, FG code…"
        />
        <button
          onClick={onFilters}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-accent transition-colors"
        >
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>
        <button
          onClick={onImpromptuPO}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-3 text-xs font-medium text-white hover:bg-amber-600 transition-colors sm:ml-auto"
        >
          <Zap className="h-3.5 w-3.5" /> Impromptu PO
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          C. STATUS TABS — All + one per status, each with a live count.
         ════════════════════════════════════════════════════════════════════ */}
      <Card className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
        <CardContent className="p-0">
          {TABS.map((tab) => {
            const label = tab === "all" ? "All" : STATUS_CONFIG[tab].label
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
                {label} <span className="opacity-70">({counts[tab] ?? 0})</span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          D. MAIN PO TABLE.
         ════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>PO Date</TableHead>
                <TableHead>Production Date</TableHead>
                <TableHead>Exp. Dispatch</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>FG Code</TableHead>
                <TableHead>SKU Status</TableHead>
                <TableHead>BOM</TableHead>
                <TableHead>Filling</TableHead>
                <TableHead className="text-right">PO Qty</TableHead>
                <TableHead>Dispatched</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={16} className="text-center text-muted-foreground py-10">
                    No purchase orders match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((r) => {
                  const status = r.status ?? "open"
                  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as BadgeVariant }
                  return (
                    <TableRow key={r.id}>
                      {/* PO Number (+ IMP badge for impromptu POs) */}
                      <TableCell className="font-mono text-xs font-medium whitespace-nowrap">
                        <span>{r.po_no}</span>
                        {r.is_impromptu && (
                          <Badge variant="warning" className="ml-1.5 px-1.5 py-0 text-[10px]">IMP</Badge>
                        )}
                      </TableCell>

                      {/* Manufacturer name + code */}
                      <TableCell className="whitespace-nowrap">
                        <div className="text-xs font-medium">{r.mfg_name ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{r.mfg_code ?? ""}</div>
                      </TableCell>

                      <TableCell className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.date)}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.production_date)}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.expected_on)}</TableCell>

                      {/* SKU code + name */}
                      <TableCell className="whitespace-nowrap">
                        <div className="font-mono text-xs font-medium">{r.sku_code ?? "—"}</div>
                        <div className="text-xs text-muted-foreground max-w-[160px] truncate">{r.sku_name ?? ""}</div>
                      </TableCell>

                      <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">{r.fg_code ?? "—"}</TableCell>

                      {/* SKU master status (Active / Discontinued / …) */}
                      <TableCell>
                        <Badge
                          variant={r.sku_status === "active" ? "success" : "secondary"}
                          className="capitalize"
                        >
                          {r.sku_status ?? "—"}
                        </Badge>
                      </TableCell>

                      {/* BOM code + version */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.bom_code ?? "—"}{" "}
                        {r.bom_version && <span className="text-muted-foreground">{r.bom_version}</span>}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{r.filling_line ?? "—"}</TableCell>

                      <TableCell className="text-right text-xs font-medium tabular-nums">{fmtInt(r.qty)}</TableCell>

                      {/* Dispatched / Received progress bars (out of PO qty) */}
                      <TableCell><ProgressCell value={r.dispatched_qty} total={r.qty} barClass="bg-amber-500" /></TableCell>
                      <TableCell><ProgressCell value={r.received_qty} total={r.qty} barClass="bg-emerald-500" /></TableCell>

                      <TableCell className="text-xs whitespace-nowrap">{r.destination ?? "—"}</TableCell>

                      {/* Lifecycle status badge */}
                      <TableCell>
                        <Badge variant={cfg.variant} className="whitespace-nowrap">{cfg.label}</Badge>
                      </TableCell>

                      {/* Row action — Split (UI-only for now) */}
                      <TableCell className="text-right">
                        <button
                          onClick={() => onSplit(r.po_no)}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent transition-colors"
                        >
                          <Scissors className="h-3 w-3" /> Split
                        </button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          E. SUMMARY CARDS — six headline metrics derived from all rows.
         ════════════════════════════════════════════════════════════════════ */}
      <div className="text-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard label="Total POs" value={fmtInt(summary.total)} />
        <SummaryCard label="Open POs" value={fmtInt(summary.open)} />
        <SummaryCard label="In Production" value={fmtInt(summary.inProduction)} />
        <SummaryCard label="In Transit" value={fmtInt(summary.inTransit)} />
        <SummaryCard label="Received" value={fmtInt(summary.received)} />
        <SummaryCard label="Value of Open POs" value={fmtMoneyShort(summary.openValue)} />
      </div>
    </div>
  )
}

/** A single metric tile in the summary row. */
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
