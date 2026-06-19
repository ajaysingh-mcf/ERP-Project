"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import type { PMByMfg } from "@/types/masters"
import type { MasterField } from "@/components/masters/field-config"
import {
  PmRateTable,
  fmtDate,
  statusBadge,
  type AnyRow,
  type ColumnDef,
} from "./PmRateTable"
import { MfgPMDetailDialog } from "./MfgPMDetailDialog"

const PM_MFG_FIELDS: MasterField[] = [
  { key: "pm_code",  label: "PM Code",   aliases: ["code"], placeholder: "e.g. PM-001",  sample: "PM-001" },
  { key: "name",     label: "Name",      required: true,    placeholder: "Material name", sample: "Label 100ml", colSpan: 2 },
  { key: "type",     label: "Type",      placeholder: "e.g. Label / Carton",              sample: "Label" },
  { key: "hsn_code", label: "HSN Code",  placeholder: "e.g. 48191000",                    sample: "48191000" },
  { key: "uom",      label: "Base UOM",  placeholder: "e.g. pcs",                         sample: "pcs" },
  {
    key: "status", label: "Status", type: "select", default: "active", sample: "active",
    options: [{ value: "active", label: "Active" }, { value: "discontinued", label: "Discontinued" }],
  },
  { key: "mfg_code",       label: "MFG Code",       required: true, placeholder: "e.g. MFG-001",       sample: "MFG-001" },
  { key: "mfg_id",         label: "MFG ID",         type: "number", placeholder: "Numeric MFG ID",      sample: "1" },
  { key: "curr_rate",      label: "Rate (₹)",       type: "number", placeholder: "e.g. 150.00",         sample: "150.00" },
  { key: "rate_uom",       label: "Rate UOM",       placeholder: "e.g. pcs",                             sample: "pcs" },
  { key: "effective_from", label: "Effective From", placeholder: "YYYY-MM-DD",                           sample: "2025-01-01" },
]

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

export default function ManufacturerPackingMaterialsClient({ rows }: { rows: PMByMfg[] }) {
  const [selectedRow, setSelectedRow] = useState<PMByMfg | null>(null)

  return (
    <>
      <PmRateTable
        rows={rows as unknown as AnyRow[]}
        columns={MFG_COLUMNS}
        addFormFields={PM_MFG_FIELDS}
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
