"use client"

/**
 * CLIENT component — Vendor view of /masters/raw-materials.
 *
 * Thin wrapper that passes vendor-specific columns + pagination props to RmRateTable.
 * Also owns the VendorDetailDialog (opened when the user clicks the compare icon).
 */

import { useState } from "react"
import { GitCompare, Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { RM, Vendor, Mfg } from "@/types/masters"
import {
  RmRateTable,
  fmtDate,
  type AnyRow,
  type ColumnDef,
} from "./RmRateTable"
import { VendorDetailDialog } from "./VendorDetailDialog"
import { EditRmVendorRateDialog } from "./EditRmVendorRateDialog"

const vrmStatusBadge = (row: AnyRow) => {
  const s = row.vrm_status as string | null
  if (s === "in_review") return <Badge variant="warning"  className="capitalize">In Review</Badge>
  if (s === "draft")     return <Badge variant="secondary" className="capitalize">Draft</Badge>
  return <Badge variant={s === "active" ? "success" : "secondary"} className="capitalize">{s ?? "—"}</Badge>
}

const VENDOR_COLUMNS: ColumnDef[] = [
  { key: "rm_code",        label: "RM Code",        sortAs: "text", className: "font-mono text-xs font-medium" },
  { key: "name",           label: "Name",           sortAs: "text", className: "font-medium" },
  { key: "inci_name",      label: "INCI Name",      sortAs: "text" },
  { key: "make",           label: "Make",           sortAs: "text" },
  { key: "type",           label: "Type",           sortAs: "text" },
  { key: "curr_rate",      label: "Current Rate",   sortAs: "num"  },
  { key: "vendor_code",    label: "Vendor Code",    sortAs: "text" },
  { key: "vendor_id",      label: "Vendor Id",      sortAs: "text" },
  { key: "hsn_code",       label: "HSN Code",       sortAs: "text" },
  { key: "vrm_status",     label: "Status",         sortAs: "text", render: vrmStatusBadge },
  { key: "moq",            label: "MOQ",            sortAs: "num"  },
  { key: "uom",            label: "UOM",            sortAs: "text", className: "uppercase text-xs text-muted-foreground" },
  { key: "effective_from", label: "Effective From", sortAs: "date", render: (r) => fmtDate(r.effective_from) },
  { key: "effective_to",   label: "Effective To",   sortAs: "date", render: (r) => fmtDate(r.effective_to) },
]

export default function VendorRawMaterialsClient({
  rows,
  vendors,
  manufacturers,
  total,
  page,
  pageSize,
  currentSearch,
  currentStatus,
}: {
  rows: RM[]
  vendors: Vendor[]
  manufacturers: Mfg[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentStatus: string
}) {
  const [selectedRow, setSelectedRow] = useState<RM | null>(null)
  const [editRow, setEditRow] = useState<RM | null>(null)

  return (
    <>
      <RmRateTable
        rows={rows as unknown as AnyRow[]}
        columns={VENDOR_COLUMNS}
        vendors={vendors}
        manufacturers={manufacturers}
        total={total}
        page={page}
        pageSize={pageSize}
        currentSearch={currentSearch}
        currentStatus={currentStatus}
        actionColumn={(row) => {
          const typedRow = row as unknown as RM
          const isLocked = typedRow.vrm_status === "in_review"
          return (
            <div className="flex items-center gap-1">
              {isLocked && (
                <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 mr-1">
                  In Review
                </span>
              )}
              {typedRow.vrm_status === "draft" && (
                <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 mr-1">
                  Draft
                </span>
              )}
              <button
                onClick={() => !isLocked && setEditRow(typedRow)}
                disabled={isLocked}
                className={`p-1.5 rounded-md transition-colors ${
                  isLocked
                    ? "opacity-40 cursor-not-allowed text-muted-foreground"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                }`}
                title={isLocked ? "Pending approval — cannot edit" : "Edit rate"}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSelectedRow(typedRow)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="View vendor comparison"
              >
                <GitCompare className="h-4 w-4" />
              </button>
            </div>
          )
        }}
      />

      <VendorDetailDialog
        row={selectedRow}
        allRows={rows}
        onClose={() => setSelectedRow(null)}
      />
      <EditRmVendorRateDialog
        row={editRow}
        onSuccess={() => { setEditRow(null); window.location.reload() }}
        onClose={() => setEditRow(null)}
      />
    </>
  )
}
