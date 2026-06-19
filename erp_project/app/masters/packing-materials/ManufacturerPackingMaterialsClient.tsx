"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import type { PMByMfg, Vendor, Mfg } from "@/types/masters"
import {
  PmRateTable,
  fmtDate,
  statusBadge,
  type AnyRow,
  type ColumnDef,
} from "./PmRateTable"
import { MfgPMDetailDialog } from "./MfgPMDetailDialog"

const MFG_COLUMNS: ColumnDef[] = [
  { key: "pm_code",        label: "PM Code",        sortAs: "text", className: "font-mono text-xs font-medium" },
  { key: "name",           label: "Name",           sortAs: "text", className: "font-medium" },
  { key: "type",           label: "Type",           sortAs: "text" },
  { key: "hsn_code",       label: "HSN Code",       sortAs: "text" },
  { key: "mfg_code",       label: "MFG Code",       sortAs: "text" },
  { key: "mfg_id",         label: "MFG ID",         sortAs: "num"  },
  { key: "curr_rate",      label: "Current Rate",   sortAs: "num"  },
  { key: "uom",            label: "UOM",            sortAs: "text", className: "uppercase text-xs text-muted-foreground" },
  { key: "status",         label: "Status",         sortAs: "text", render: statusBadge },
  { key: "effective_from", label: "Effective From", sortAs: "date", render: (r) => fmtDate(r.effective_from) },
]

export default function ManufacturerPackingMaterialsClient({
  rows,
  vendors,
  manufacturers,
}: {
  rows: PMByMfg[]
  vendors: Vendor[]
  manufacturers: Mfg[]
}) {
  const [selectedRow, setSelectedRow] = useState<PMByMfg | null>(null)

  return (
    <>
      <PmRateTable
        rows={rows as unknown as AnyRow[]}
        columns={MFG_COLUMNS}
        vendors={vendors}
        manufacturers={manufacturers}
        actionColumn={(row) => (
          <button
            onClick={() => setSelectedRow(row as unknown as PMByMfg)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="View manufacturer comparison"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
      />

      <MfgPMDetailDialog
        row={selectedRow}
        allRows={rows}
        onClose={() => setSelectedRow(null)}
      />
    </>
  )
}
