/**
 * Export Column Configurations
 *
 * One ExportColumn[] per master entity / view. These arrays define which DB
 * fields appear in a downloaded file, in what order, and how values are
 * serialized (text, number, or date).
 *
 * Rules for `type`:
 *   "text"   — any code, name, or string field (HSN / GST especially, to
 *              preserve leading zeros in Excel)
 *   "number" — monetary rates, quantities, IDs used as numbers
 *   "date"   — any timestamp or date field (serialized as YYYY-MM-DD)
 *
 * Add or reorder columns here without touching the export routes or the
 * DownloadButton — this is the single source of truth for exported shape.
 */

import type { ExportColumn } from "@/lib/export"

// ── Material Master — Raw Material (base record, no rates) ───────────────────

export const RM_BASE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "rm_code",   label: "RM Code",   type: "text" },
  { key: "name",      label: "Name",      type: "text" },
  { key: "make",      label: "Make",      type: "text" },
  { key: "type",      label: "Type",      type: "text" },
  { key: "uom",       label: "UOM",       type: "text" },
  { key: "hsn_code",  label: "HSN Code",  type: "text" }, // text: preserve leading zeros
  { key: "inci_name", label: "INCI Name", type: "text" },
  { key: "status",    label: "Status",    type: "text" },
]

// ── Material Master — Packing Material (base record, no rates) ────────────────

export const PM_BASE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "pm_code",  label: "PM Code",  type: "text" },
  { key: "name",     label: "Name",     type: "text" },
  { key: "type",     label: "Type",     type: "text" },
  { key: "uom",      label: "UOM",      type: "text" },
  { key: "hsn_code", label: "HSN Code", type: "text" }, // text: preserve leading zeros
  { key: "status",   label: "Status",   type: "text" },
]

// ── SKUs ─────────────────────────────────────────────────────────────────────

export const SKU_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "sku_code",   label: "SKU Code",   type: "text" },
  { key: "name",       label: "Name",       type: "text" },
  { key: "brand",      label: "Brand",      type: "text" },
  { key: "category",   label: "Category",   type: "text" },
  { key: "status",     label: "Status",     type: "text" },
  { key: "created_at", label: "Created At", type: "date" },
]

// ── Raw Materials — Vendor view ───────────────────────────────────────────────

export const RM_VENDOR_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "rm_code",        label: "RM Code",        type: "text"   },
  { key: "name",           label: "Name",           type: "text"   },
  { key: "inci_name",      label: "INCI Name",      type: "text"   },
  { key: "make",           label: "Make",           type: "text"   },
  { key: "type",           label: "Type",           type: "text"   },
  { key: "uom",            label: "UOM",            type: "text"   },
  { key: "hsn_code",       label: "HSN Code",       type: "text"   }, // text: preserve leading zeros
  { key: "status",         label: "Status",         type: "text"   },
  { key: "vendor_code",    label: "Vendor Code",    type: "text"   },
  { key: "curr_rate",      label: "Current Rate",   type: "number" },
  { key: "moq",            label: "MOQ",            type: "number" },
  { key: "effective_from", label: "Effective From", type: "date"   },
  { key: "effective_to",   label: "Effective To",   type: "date"   },
]

// ── Raw Materials — Manufacturer view ────────────────────────────────────────

export const RM_MFG_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "rm_code",               label: "RM Code",              type: "text"   },
  { key: "name",                  label: "Name",                 type: "text"   },
  { key: "make",                  label: "Make",                 type: "text"   },
  { key: "type",                  label: "Type",                 type: "text"   },
  { key: "uom",                   label: "UOM",                  type: "text"   },
  { key: "hsn_code",              label: "HSN Code",             type: "text"   },
  { key: "status",                label: "Status",               type: "text"   },
  { key: "mfg_code",              label: "Mfg Code",             type: "text"   },
  { key: "approved_vendor_code",  label: "Approved Vendor Code", type: "text"   },
  { key: "curr_rate",             label: "Current Rate",         type: "number" },
  { key: "effective_from",        label: "Effective From",       type: "date"   },
]

// ── Packing Materials — Vendor view ──────────────────────────────────────────

export const PM_VENDOR_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "pm_code",        label: "PM Code",        type: "text"   },
  { key: "name",           label: "Name",           type: "text"   },
  { key: "type",           label: "Type",           type: "text"   },
  { key: "uom",            label: "UOM",            type: "text"   },
  { key: "hsn_code",       label: "HSN Code",       type: "text"   },
  { key: "status",         label: "Status",         type: "text"   },
  { key: "vendor_code",    label: "Vendor Code",    type: "text"   },
  { key: "curr_rate",      label: "Current Rate",   type: "number" },
  { key: "moq",            label: "MOQ",            type: "number" },
  { key: "effective_from", label: "Effective From", type: "date"   },
  { key: "effective_to",   label: "Effective To",   type: "date"   },
]

// ── Packing Materials — Manufacturer view ────────────────────────────────────

export const PM_MFG_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "pm_code",        label: "PM Code",      type: "text"   },
  { key: "name",           label: "Name",         type: "text"   },
  { key: "type",           label: "Type",         type: "text"   },
  { key: "uom",            label: "UOM",          type: "text"   },
  { key: "hsn_code",       label: "HSN Code",     type: "text"   },
  { key: "status",         label: "Status",       type: "text"   },
  { key: "mfg_code",       label: "Mfg Code",     type: "text"   },
  { key: "curr_rate",      label: "Current Rate", type: "number" },
  { key: "effective_from", label: "Effective From", type: "date" },
]

// ── Vendors ───────────────────────────────────────────────────────────────────

export const VENDOR_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "code",       label: "Vendor Code", type: "text" },
  { key: "name",       label: "Name",        type: "text" },
  { key: "type",       label: "Type",        type: "text" },
  { key: "location",   label: "Location",    type: "text" },
  { key: "gst_number", label: "GST Number",  type: "text" }, // text: preserve format
  { key: "status",     label: "Status",      type: "text" },
]

// ── Manufacturers ─────────────────────────────────────────────────────────────

export const MFG_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "code",       label: "Code",       type: "text" },
  { key: "name",       label: "Name",       type: "text" },
  { key: "location",   label: "Location",   type: "text" },
  { key: "gst_number", label: "GST Number", type: "text" }, // text: preserve format
  { key: "status",     label: "Status",     type: "text" },
]

// ── BOM Master ────────────────────────────────────────────────────────────────

export const BOM_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "bom_code",        label: "BOM Code",        type: "text"   },
  { key: "sku_code",        label: "SKU Code",        type: "text"   },
  { key: "mtrl_type",       label: "Material Type",   type: "text"   },
  { key: "mtrl_id",         label: "Material ID",     type: "number" },
  { key: "amount",          label: "Amount",          type: "number" },
  { key: "uom",             label: "UOM",             type: "text"   },
  { key: "mtrl_cost",       label: "Material Cost",   type: "number" },
  { key: "material_status", label: "Material Status", type: "text"   },
  { key: "bom_status",      label: "BOM Status",      type: "text"   },
  { key: "effective_from",  label: "Effective From",  type: "date"   },
  { key: "effective_till",  label: "Effective Till",  type: "date"   },
]
