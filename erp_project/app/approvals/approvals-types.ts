export type ApprovalItem = {
  field_name: string
  old_value: string
  new_value: string
}

export type Approval = {
  id: number
  module: string
  entity_id: number
  raised_on: string
  raised_by_name: string
  items: ApprovalItem[]
  entity_code: string | null
  entity_name: string | null
  entity_secondary_code: string | null
  entity_secondary_name: string | null
}

export const MODULE_LABEL: Record<string, string> = {
  SKU: "SKU",
  RM_RATE: "RM Rate (MFG)",
  PM_RATE: "PM Rate (MFG)",
  RM_VRM: "RM Rate (Vendor)",
  PM_VRM: "PM Rate (Vendor)",
  RM_MAT: "Raw Material",
  PM_MAT: "Packing Material",
  VENDOR: "Vendor",
  MFG: "Manufacturer",
  PO: "Impromptu PO",
  PO_BULK: "Bulk PO Upload",
  BOM: "BOM",
}

export const MODULE_COLOR: Record<string, string> = {
  SKU: "bg-blue-50 text-blue-700 border-blue-200",
  RM_RATE: "bg-purple-50 text-purple-700 border-purple-200",
  PM_RATE: "bg-orange-50 text-orange-700 border-orange-200",
  RM_VRM: "bg-green-50 text-green-700 border-green-200",
  PM_VRM: "bg-teal-50 text-teal-700 border-teal-200",
  RM_MAT: "bg-rose-50 text-rose-700 border-rose-200",
  PM_MAT: "bg-violet-50 text-violet-700 border-violet-200",
  VENDOR: "bg-indigo-50 text-indigo-700 border-indigo-200",
  MFG: "bg-amber-50 text-amber-700 border-amber-200",
  PO: "bg-yellow-50 text-yellow-700 border-yellow-200",
  PO_BULK: "bg-cyan-50 text-cyan-700 border-cyan-200",
  BOM: "bg-lime-50 text-lime-700 border-lime-200",
}

export function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2)
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}
