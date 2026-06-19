"use client"

import { useState } from "react"
import { GitCompare } from "lucide-react"
import type { PMVendor, Vendor, Mfg } from "@/types/masters"
import {
  PmRateTable,
  fmtDate,
  statusBadge,
  type AnyRow,
  type ColumnDef,
} from "./PmRateTable"
import { VendorPMDetailDialog } from "./VendorPMDetailDialog"

const VENDOR_COLUMNS: ColumnDef[] = [
  { key: "pm_code",        label: "PM Code",        sortAs: "text", className: "font-mono text-xs font-medium" },
  { key: "name",           label: "Name",           sortAs: "text", className: "font-medium" },
  { key: "type",           label: "Type",           sortAs: "text" },
  { key: "hsn_code",       label: "HSN Code",       sortAs: "text" },
  { key: "vendor_code",    label: "Vendor Code",    sortAs: "text" },
  { key: "vendor_id",      label: "Vendor ID",      sortAs: "num"  },
  { key: "curr_rate",      label: "Current Rate",   sortAs: "num"  },
  { key: "moq",            label: "MOQ",            sortAs: "num"  },
  { key: "uom",            label: "UOM",            sortAs: "text", className: "uppercase text-xs text-muted-foreground" },
  { key: "status",         label: "Status",         sortAs: "text", render: statusBadge },
  { key: "effective_from", label: "Effective From", sortAs: "date", render: (r) => fmtDate(r.effective_from) },
  { key: "effective_to",   label: "Effective To",   sortAs: "date", render: (r) => fmtDate(r.effective_to) },
]

export default function VendorPackingMaterialsClient({
  rows,
  vendors,
  manufacturers,
}: {
  rows: PMVendor[]
  vendors: Vendor[]
  manufacturers: Mfg[]
}) {
  const [selectedRow, setSelectedRow] = useState<PMVendor | null>(null)

  return (
    <>
      <PmRateTable
        rows={rows as unknown as AnyRow[]}
        columns={VENDOR_COLUMNS}
        vendors={vendors}
        manufacturers={manufacturers}
        actionColumn={(row) => (
          <button
            onClick={() => setSelectedRow(row as unknown as PMVendor)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="View vendor comparison"
          >
            <GitCompare className="h-4 w-4" />
          </button>
        )}
      />

      <VendorPMDetailDialog
        row={selectedRow}
        allRows={rows}
        onClose={() => setSelectedRow(null)}
      />
    </>
  )
}
