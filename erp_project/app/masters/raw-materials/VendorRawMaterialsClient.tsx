"use client"

/**
 * CLIENT component — Vendor view of /masters/raw-materials.
 *
 * Thin wrapper that passes vendor-specific columns + pagination props to RmRateTable.
 * Also owns the VendorDetailDialog (opened when the user clicks the compare icon).
 */

import { useState } from "react"
import { GitCompare } from "lucide-react"
import type { RM, Vendor, Mfg } from "@/types/masters"
import {
  RmRateTable,
  fmtDate,
  statusBadge,
  type AnyRow,
  type ColumnDef,
} from "./RmRateTable"
import { VendorDetailDialog } from "./VendorDetailDialog"

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
  { key: "status",         label: "Status",         sortAs: "text", render: statusBadge },
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
        actionColumn={(row) => (
          <button
            onClick={() => setSelectedRow(row as unknown as RM)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="View vendor comparison"
          >
            <GitCompare className="h-4 w-4" />
          </button>
        )}
      />

      {/* Compare dialog — shows all rates for the selected RM code on the current page */}
      <VendorDetailDialog
        row={selectedRow}
        allRows={rows}
        onClose={() => setSelectedRow(null)}
      />
    </>
  )
}
