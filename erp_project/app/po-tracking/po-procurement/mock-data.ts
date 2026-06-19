/**
 * MOCK data for the PO Procurement page.
 *
 * WHY MOCK:
 *   This page is a UI prototype. It is intentionally NOT wired to the database —
 *   the live `purchase_orders` table doesn't carry most of the fields this design
 *   needs (production date, dispatched qty, destination, filling line, FG code,
 *   BOM version, impromptu flag). Rather than alter the schema, everything the
 *   page shows is hard-coded here. When a real backend is ready, replace these
 *   exports with a server-side query and delete this file.
 *
 * Two datasets live here:
 *   1. PURCHASE_ORDERS — rows for the main PO table / tabs / summary cards.
 *   2. PENDING_PLAN_POS — rows for the top "Action Required" banner.
 */

/* ─── 1. Main PO table ──────────────────────────────────────────────────── */

/** The six lifecycle statuses a PO moves through (drives tabs + status badge). */
export type PoStatus =
  | "open"
  | "in_production"
  | "partially_dispatched"
  | "fully_dispatched"
  | "received"
  | "cancelled"

/** One purchase-order row as rendered by the table. All numbers are plain
 *  numbers (not DB DECIMAL strings) and dates are ISO yyyy-mm-dd strings. */
export type PoRow = {
  id: number
  po_no: string
  is_impromptu: boolean
  mfg_name: string
  mfg_code: string
  date: string            // PO Date
  production_date: string  // Production Date
  expected_on: string     // Exp. Dispatch
  sku_code: string
  sku_name: string
  sku_status: "active" | "discontinued"
  fg_code: string
  bom_code: string
  bom_version: string
  filling_line: string
  qty: number
  dispatched_qty: number
  received_qty: number
  total_amount: number
  destination: string
  status: PoStatus
}

export const PURCHASE_ORDERS: PoRow[] = [
  {
    id: 12, po_no: "PO-2024-012", is_impromptu: false,
    mfg_name: "Prime Manufacturing Ltd.", mfg_code: "MFG-001",
    date: "2024-05-01", production_date: "2024-05-15", expected_on: "2024-06-01",
    sku_code: "SKU-FG-001", sku_name: "Product Alpha 100ml", sku_status: "active",
    fg_code: "FGC-SKU001-BOM001-MFG001", bom_code: "BOM-001", bom_version: "v3",
    filling_line: "Line 1 — Filling + Label", qty: 5000, dispatched_qty: 2500,
    received_qty: 2500, total_amount: 1000000, destination: "Mother Warehouse",
    status: "partially_dispatched",
  },
  {
    id: 13, po_no: "PO-2024-013", is_impromptu: false,
    mfg_name: "Apex Industries", mfg_code: "MFG-002",
    date: "2024-05-01", production_date: "2024-05-18", expected_on: "2024-06-05",
    sku_code: "SKU-FG-001", sku_name: "Product Alpha 100ml", sku_status: "active",
    fg_code: "FGC-SKU001-BOM001-MFG002", bom_code: "BOM-001", bom_version: "v3",
    filling_line: "Apex Filling Unit 2", qty: 3000, dispatched_qty: 0,
    received_qty: 0, total_amount: 600000, destination: "Mother Warehouse",
    status: "in_production",
  },
  {
    id: 10, po_no: "PO-2024-010", is_impromptu: false,
    mfg_name: "Prime Manufacturing Ltd.", mfg_code: "MFG-001",
    date: "2024-04-10", production_date: "2024-04-25", expected_on: "2024-05-10",
    sku_code: "SKU-FG-002", sku_name: "Product Beta 250ml", sku_status: "active",
    fg_code: "FGC-SKU002-BOM002-MFG001", bom_code: "BOM-002", bom_version: "v2",
    filling_line: "Line 2 — Filling + Sealing", qty: 4000, dispatched_qty: 4000,
    received_qty: 3950, total_amount: 800000, destination: "Mother Warehouse",
    status: "received",
  },
  {
    id: 11, po_no: "PO-2024-011", is_impromptu: false,
    mfg_name: "Delta Production Co.", mfg_code: "MFG-003",
    date: "2024-04-15", production_date: "2024-05-05", expected_on: "2024-05-20",
    sku_code: "SKU-FG-003", sku_name: "Product Gamma 500ml", sku_status: "active",
    fg_code: "FGC-SKU003-BOM003-MFG003", bom_code: "BOM-003", bom_version: "v1",
    filling_line: "Delta Batch Filling", qty: 2000, dispatched_qty: 2000,
    received_qty: 2000, total_amount: 400000, destination: "Child Warehouse — North",
    status: "received",
  },
  {
    id: 3, po_no: "PO-IMP-2024-003", is_impromptu: true,
    mfg_name: "Apex Industries", mfg_code: "MFG-002",
    date: "2024-05-10", production_date: "2024-05-20", expected_on: "2024-05-30",
    sku_code: "SKU-FG-001", sku_name: "Product Alpha 100ml", sku_status: "active",
    fg_code: "FGC-SKU001-BOM001-MFG002", bom_code: "BOM-001", bom_version: "v3",
    filling_line: "Apex Filling Unit 1", qty: 1500, dispatched_qty: 1500,
    received_qty: 0, total_amount: 540000, destination: "Child Warehouse — South",
    status: "fully_dispatched",
  },
  {
    id: 8, po_no: "PO-2024-008", is_impromptu: false,
    mfg_name: "Prime Manufacturing Ltd.", mfg_code: "MFG-001",
    date: "2024-03-20", production_date: "2024-04-01", expected_on: "2024-04-15",
    sku_code: "SKU-FG-001", sku_name: "Product Alpha 100ml", sku_status: "discontinued",
    fg_code: "FGC-SKU001-BOM001V2-MFG001", bom_code: "BOM-001", bom_version: "v2",
    filling_line: "Line 1", qty: 3000, dispatched_qty: 0,
    received_qty: 0, total_amount: 510000, destination: "Mother Warehouse",
    status: "cancelled",
  },
  {
    id: 14, po_no: "PO-2024-014", is_impromptu: false,
    mfg_name: "Prime Manufacturing Ltd.", mfg_code: "MFG-001",
    date: "2024-05-15", production_date: "2024-05-25", expected_on: "2024-06-10",
    sku_code: "SKU-FG-002", sku_name: "Product Beta 250ml", sku_status: "active",
    fg_code: "FGC-SKU002-BOM002-MFG002", bom_code: "BOM-002", bom_version: "v2",
    filling_line: "Line 2 — Filling + Sealing", qty: 3500, dispatched_qty: 0,
    received_qty: 0, total_amount: 600000, destination: "Mother Warehouse",
    status: "open",
  },
]

/* ─── 2. "Action Required" banner ───────────────────────────────────────── */

/** Visual priority of a pending PO — drives the coloured pill in the banner. */
export type PendingPriority = "High" | "Medium" | "Low"

/** One "pending to be raised" PO suggested by the (future) production plan. */
export type PendingPlanPO = {
  id: string
  sku_code: string
  sku_name: string
  mfg_name: string
  mfg_code: string
  bom: string          // BOM + version, e.g. "BOM-001 v3"
  planned_qty: number
  phase: string        // planning bucket, e.g. "June P1 (1–15 Jun)"
  po_due_by: string    // ISO yyyy-mm-dd
  priority: PendingPriority
}

export const PENDING_PLAN_POS: PendingPlanPO[] = [
  {
    id: "plan-1", sku_code: "SKU-FG-001", sku_name: "Product Alpha 100ml",
    mfg_name: "Prime Manufacturing Ltd.", mfg_code: "MFG-001", bom: "BOM-001 v3",
    planned_qty: 8000, phase: "June P1 (1–15 Jun)", po_due_by: "2024-05-28", priority: "High",
  },
  {
    id: "plan-2", sku_code: "SKU-FG-002", sku_name: "Product Beta 250ml",
    mfg_name: "Prime Manufacturing Ltd.", mfg_code: "MFG-001", bom: "BOM-002 v2",
    planned_qty: 4000, phase: "June P1 (1–15 Jun)", po_due_by: "2024-05-28", priority: "High",
  },
  {
    id: "plan-3", sku_code: "SKU-FG-003", sku_name: "Product Gamma 500ml",
    mfg_name: "Delta Production Co.", mfg_code: "MFG-003", bom: "BOM-003 v1",
    planned_qty: 2500, phase: "June P2 (16–30 Jun)", po_due_by: "2024-06-10", priority: "Medium",
  },
]
