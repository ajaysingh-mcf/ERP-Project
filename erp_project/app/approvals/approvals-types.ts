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
  /** Present only on /approvals/history rows — resolved approvals. */
  status?: "approved" | "rejected"
  approved_by_name?: string | null
  approved_on?: string | null
  remarks?: string | null
}

export const HISTORY_STATUS_COLOR: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
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
  VENDOR_BULK: "Bulk Vendor Upload",
  MFG_BULK: "Bulk Manufacturer Upload",
  RM_BULK: "Bulk RM Upload",
  PM_BULK: "Bulk PM Upload",
  BOM: "BOM",
}

/** Modules whose approval_items store {s3_key, filename, row_count} for a
 *  whole uploaded batch instead of a field-level diff — see the CsvFileCard
 *  branch in ApprovalCard.tsx and the *_BULK handlers in
 *  lib/approvals/module-handlers.ts. */
export const BULK_MODULES = new Set([
  "PO_BULK", "VENDOR_BULK", "MFG_BULK", "RM_BULK", "PM_BULK",
])

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
  VENDOR_BULK: "bg-indigo-50 text-indigo-700 border-indigo-200",
  MFG_BULK: "bg-amber-50 text-amber-700 border-amber-200",
  RM_BULK: "bg-rose-50 text-rose-700 border-rose-200",
  PM_BULK: "bg-violet-50 text-violet-700 border-violet-200",
  BOM: "bg-lime-50 text-lime-700 border-lime-200",
}

export function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2)
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    // Explicit IST — don't rely on the host process's local timezone, which
    // differs between dev machines and deployment targets.
    timeZone: "Asia/Kolkata",
  })
}
