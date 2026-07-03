"use client"

/**
 * CLIENT component for /masters/bom-master.
 *
 * Receives a paginated BOM slice from the server page (one row per BOM
 * header). Owns the URL-synced search/status filters and the toolbar, and
 * composes the table + detail panel — their shared selection/edit state
 * lives in useBomDetailPanel.
 *
 * All filter changes reset to page 1 via the local navigate() helper.
 * router.refresh() after wizard submit / edit save keeps the user on the
 * current page.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { UrlSearchInput } from "@/components/masters/UrlSearchInput"
import {
  MasterToolbar,
  MasterToolbarActions,
} from "@/components/masters/MasterToolbar"
import { DownloadButton } from "@/components/masters/DownloadButton"
import { cn } from "@/lib/utils"
import { BomCreationWizard } from "./BomCreationWizard"
import { type BomMaterialOption } from "./BomLineEditorGrid"
import { BomTable } from "./BomTable"
import { BomDetailPanel } from "./BomDetailPanel"
import { useBomDetailPanel } from "./useBomDetailPanel"
import type { AccessLevel } from "@/lib/permissions"
import type { BomListItem, Sku } from "@/types/masters"

export default function BOMMasterComponent({
  rows,
  total,
  page,
  pageSize,
  currentSearch,
  currentStatus,
  skus,
  rmMaterials,
  pmMaterials,
  accessLevel,
}: {
  rows: BomListItem[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentStatus: string
  skus: Sku[]
  rmMaterials: BomMaterialOption[]
  pmMaterials: BomMaterialOption[]
  accessLevel: AccessLevel
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const canEdit      = accessLevel === "editor"

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

  const hasFilters = Boolean(currentSearch || currentStatus)
  const refresh    = () => router.refresh()

  const panel = useBomDetailPanel()

  return (
    <>
      {/* ── Toolbar ── */}
      <MasterToolbar>
        <UrlSearchInput
          initialValue={currentSearch}
          placeholder="Search by BOM code or SKU code…"
        />

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
          {canEdit && (
            <BomCreationWizard
              skus={skus}
              rmMaterials={rmMaterials}
              pmMaterials={pmMaterials}
              onSuccess={refresh}
              onEditExisting={panel.openEditMode}
            />
          )}
        </MasterToolbarActions>
      </MasterToolbar>

      {/* ── Split-panel layout ── */}
      <div className="flex gap-4 items-start">

        {/* ── Main table — narrows when detail panel is open ── */}
        <div
          className={cn(
            "min-w-0 transition-all duration-300 ease-in-out",
            panel.selectedBomId != null ? "w-[58%] shrink-0" : "w-full"
          )}
        >
          <BomTable
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            hasFilters={hasFilters}
            onClearFilters={() => navigate({ search: "", status: "" })}
            canEdit={canEdit}
            selectedBomId={panel.selectedBomId}
            onRowClick={panel.handleRowClick}
            onPrefetch={panel.prefetchDetail}
            onEdit={panel.openEditMode}
          />
        </div>

        {/* ── Detail panel — slides in when a row is selected, pinned to the
               table's top edge and capped to the viewport so long material
               line lists scroll internally instead of overflowing the page ── */}
        <div
          className={cn(
            "min-w-0 overflow-hidden transition-all duration-300 ease-in-out sticky top-6",
            panel.selectedBomId != null ? "flex-1 opacity-100" : "w-0 flex-none opacity-0"
          )}
        >
          {panel.selectedBomId != null && (
            <BomDetailPanel
              detail={panel.detail}
              detailLoading={panel.detailLoading}
              detailError={panel.detailError}
              editMode={panel.editMode}
              activeMtrlType={panel.activeMtrlType}
              onChangeMtrlType={panel.setActiveMtrlType}
              rmLines={panel.rmLines}
              pmLines={panel.pmLines}
              rmDetailTotal={panel.rmDetailTotal}
              rmIsBalanced={panel.rmIsBalanced}
              visibleLines={panel.visibleLines}
              canEdit={canEdit}
              onClose={panel.closeDetail}
              onEdit={panel.openEditMode}
              editRmRows={panel.editRmRows}
              editPmRows={panel.editPmRows}
              onChangeEditRm={panel.setEditRmRows}
              onChangeEditPm={panel.setEditPmRows}
              rmMaterials={rmMaterials}
              pmMaterials={pmMaterials}
              saveError={panel.saveError}
              saving={panel.saving}
              onCancelEdit={panel.cancelEdit}
              onSaveEdit={panel.saveEdit}
            />
          )}
        </div>

      </div>
    </>
  )
}
