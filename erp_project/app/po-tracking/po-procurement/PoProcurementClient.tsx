"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Filter, Plus, Upload } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { UrlSearchInput } from "@/components/masters/UrlSearchInput"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { cn } from "@/lib/utils"

import type { MfgOption, PoRow, SkuOption, TabKey, WarehouseOption } from "./po-types"
import { STATUS_CONFIG, STATUS_KEYS, TABS } from "./po-types"
import { fmtInt, fmtMoney } from "./po-utils"
import PoTable from "./PoTable"
import AddPODialog from "./AddPODialog"
import ImpromptuPODialog from "./ImpromptuPODialog"
import PoBulkUploadDialog from "./PoBulkUploadDialog"
import SplitPODialog from "./SplitPODialog"

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

export default function PoProcurementClient({
  rows,
  total,
  page,
  pageSize,
  currentSearch,
  currentStatus,
  statusCounts,
  summary,
  skuOptions,
  mfgOptions,
  warehouseOptions,
  sessionUserId,
}: {
  rows: PoRow[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentStatus: string
  statusCounts: Record<string, number>
  summary: { total: number; raised: number; punched: number; partiallyReceived: number; openValue: number }
  skuOptions: SkuOption[]
  mfgOptions: MfgOption[]
  warehouseOptions: WarehouseOption[]
  sessionUserId: number
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [showAddPO, setShowAddPO]   = useState(false)
  const [showBulk, setShowBulk]     = useState(false)
  const [editTarget, setEditTarget] = useState<PoRow | null>(null)
  const [splitTarget, setSplitTarget] = useState<PoRow | null>(null)

  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else   params.delete(k)
    }
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  const afterAction = () => router.refresh()

  const activeTab = (currentStatus || "all") as TabKey

  return (
    <div className="space-y-4 text-xs [&_th]:h-9 [&_th]:px-3 [&_th]:text-[11px] [&_td]:px-3 [&_td]:py-2">

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <UrlSearchInput initialValue={currentSearch} placeholder="Search PO, SKU, MFG…" />
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
            const count = tab === "all"
              ? statusCounts.all
              : (statusCounts[tab] ?? 0)
            return (
              <button
                key={tab}
                onClick={() => navigate({ status: tab === "all" ? "" : tab })}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {tab === "all" ? "All" : STATUS_CONFIG[tab].label}{" "}
                <span className="opacity-70">({count})</span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <PoTable
        rows={rows}
        sessionUserId={sessionUserId}
        onEdit={setEditTarget}
        onSplit={setSplitTarget}
      />

      {/* ── Pagination ── */}
      <PaginationBar page={page} pageSize={pageSize} total={total} />

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
        mfgOptions={mfgOptions}
        onSplit={afterAction}
      />
    </div>
  )
}
