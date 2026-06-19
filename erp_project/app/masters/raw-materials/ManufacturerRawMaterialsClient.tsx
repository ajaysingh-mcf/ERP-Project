"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import type { RMByMfg, Vendor, Mfg } from "@/types/masters"
import {
  RmRateTable,
  fmtDate,
  statusBadge,
  type AnyRow,
  type ColumnDef,
} from "./RmRateTable"
import { MfgDetailDialog } from "./MfgDetailDialog"

const MFG_COLUMNS: ColumnDef[] = [
  { key: "rm_code",              label: "RM Code",         sortAs: "text", className: "font-mono text-xs font-medium" },
  { key: "name",                 label: "Name",            sortAs: "text", className: "font-medium" },
  { key: "inci_name",            label: "INCI Name",       sortAs: "text" },
  { key: "make",                 label: "Make",            sortAs: "text" },
  { key: "type",                 label: "Type",            sortAs: "text" },
  { key: "curr_rate",            label: "Current Rate",    sortAs: "num"  },
  { key: "mfg_code",             label: "MFG Code",        sortAs: "text" },
  { key: "approved_vendor_code", label: "Approved Vendor", sortAs: "text" },
  { key: "hsn_code",             label: "HSN Code",        sortAs: "text" },
  { key: "status",               label: "Status",          sortAs: "text", render: statusBadge },
  { key: "uom",                  label: "UOM",             sortAs: "text", className: "uppercase text-xs text-muted-foreground" },
  { key: "effective_from",       label: "Effective From",  sortAs: "date", render: (r) => fmtDate(r.effective_from) },
]

export default function ManufacturerRawMaterialsClient({
  rows,
  vendors,
  manufacturers,
}: {
  rows: RMByMfg[]
  vendors: Vendor[]
  manufacturers: Mfg[]
}) {
  const [selectedRow, setSelectedRow] = useState<RMByMfg | null>(null)

  return (
    <>
      <RmRateTable
        rows={rows as unknown as AnyRow[]}
        columns={MFG_COLUMNS}
        vendors={vendors}
        manufacturers={manufacturers}
        actionColumn={(row) => (
          <button
            onClick={() => setSelectedRow(row as unknown as RMByMfg)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="View manufacturer comparison"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
      />

      <MfgDetailDialog
        row={selectedRow}
        allRows={rows}
        onClose={() => setSelectedRow(null)}
      />
    </>
  )
}
