export type PoStatus =
  | "draft" | "raised" | "punched"
  | "short_closed" | "partially_received" | "received" | "cancelled"

export type PoRow = {
  id: number
  po_no: string
  date: string | null
  sku_code: string | null
  sku_name: string | null
  sku_status: string | null
  qty: string | number
  unit_price: string | number | null
  total_amount: string | number | null
  expected_on: string | null
  received_qty: string | number | null
  invoice_no: string | null
  destination: string | null
  status: PoStatus | null
  attachment_key: string | null
  mfg_id: number
  mfg_code: string
  mfg_name: string
  po_raised_by: number | null
}

export type SkuOption       = { id: number; sku_code: string; name: string; status: string }
export type MfgOption       = { id: number; code: string; name: string }
export type WarehouseOption = { id: number; name: string; location: string | null; zone: string | null; type: "CWH" | "MWH" }

export type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive" | "outline"

export const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  draft:              { label: "Draft",               variant: "outline" },
  raised:             { label: "Raised",              variant: "secondary" },
  punched:            { label: "Punched",             variant: "default" },
  short_closed:       { label: "Short Closed",        variant: "warning" },
  partially_received: { label: "Partially Received",  variant: "warning" },
  received:           { label: "Received",            variant: "success" },
  cancelled:          { label: "Cancelled",           variant: "destructive" },
}

export const STATUS_KEYS = Object.keys(STATUS_CONFIG)
export const TABS = ["all", ...STATUS_KEYS] as const
export type TabKey = (typeof TABS)[number]

export const PAGE_SIZE = 20


export type ImpromptuForm = {
  sku_code: string
  mfg_id: string
  qty: string
  expected_on: string
  destination: string
  reason: string
}

export type EditData = {
  id: number
  mfg_id: number
  sku_code: string
  qty: number | string
  expected_on: string | null
  destination: string | null
}

export const EMPTY_FORM: ImpromptuForm = {
  sku_code: "", mfg_id: "", qty: "", expected_on: "", destination: "", reason: "",
}

export type SplitRow = { destination: string; qty: string }
