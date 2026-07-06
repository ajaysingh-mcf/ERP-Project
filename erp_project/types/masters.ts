/**
 * Master-data row types — the SINGLE SOURCE OF TRUTH for the shape of each
 * master table's rows as they travel from the database to the screen.
 *
 * Where this connects (the data flow for every master entity):
 *
 *   MariaDB table
 *     └─ lib/db `query<T>(sql)`            ← casts raw mysql2 rows to type T
 *         └─ app/masters/<entity>/page.tsx ← server component, runs the SELECT
 *             └─ <Entity>Client.tsx        ← client component, renders the table
 *
 * Both the server page and its client child import the SAME type from here,
 * so a column only ever has to be added/changed in ONE place. Keep each type
 * in sync with:
 *   - the `SELECT ... FROM <table>` column list in that entity's page.tsx
 *   - the real columns in prisma/schema.prisma
 *
 * These are plain data shapes (string / number / Date / null only) with no
 * runtime values or server-only imports, so they are safe to import from both
 * server components and "use client" components.
 */

/** `skus` table — Stock Keeping Units. Used by app/masters/skus. */
export type Sku = {
  id: number
  sku_code: string
  name: string
  brand: string | null
  category: string | null
  status: string | null
  created_at: Date | null
  /** FK to users.id; optional because not every page selects it. */
  created_by?: number | null
}

/** `mfgs` table — Manufacturers (MFGs). Used by app/masters/manufacturers. */
export type Mfg = {
  id: number | null
  mfg_id: number
  code: string
  name: string
  location: string | null
  gst_number: string | null
  status: string | null
  registered_name: string | null
  zone: string | null
  bank_name: string | null
  ifsc_number: string | null
  account_number: string | null
  email: string | null
  gst_certificate_key: string | null
  cancelled_cheque_key: string | null
  pan_card_key: string | null
  misc_document_key: string | null
}

/** `vendors` table — Suppliers. `type` is one of: "rm" | "pm" | "both". Used by app/masters/vendors. */
export type Vendor = {
  vendor_id: number
  code: string
  name: string
  type: string
  location: string | null
  status: string | null
  zone: string | null
  registered_name: string | null
  gst_certificate_key:  string | null
  cancelled_cheque_key: string | null
  pan_card_key:         string | null
  misc_document_key:    string | null
}

/** `rm` table — Raw Materials. Used by app/masters/raw-materials.
 *
 * r.hsn_code , r.inci_name , r.make , r.name, r.rm_code , r.status , r.type ,
	rmv.curr_rate , rmv.effective_from, rmv.effective_to ,
    rmv.moq , rmv.uom , rmv.vendor_code , rmv.vendor_id
*/
export type RM = {
  rm_code: string | null
  name: string
  make: string | null
  type: string | null
  uom: string | null
  status: string | null
  hsn_code: string | null
  inci_name: string | null
  curr_rate: string | null
  effective_from: string | null
  effective_to : string | null
  moq:number | 0
  vendor_code: string | null
  vendor_id: string | null
  /** Primary key of the rm_vrm_dynamic rate row — for approval flow. */
  vrm_id: number | null
  /** Status of the rm_vrm_dynamic rate row — for approval badges. */
  vrm_status: string | null
}

/** Raw Material rate row as seen through the MANUFACTURER rate master (`rm_mrm`).
 *  Used by app/masters/raw-materials when the "By Manufacturer" view is active.
 *
 *  rmm.rm_id, rmm.mfg_id, rmm.mfg_code, rmm.approved_vendor_id,
 *  rmm.approved_vendor_code, rmm.curr_rate, rmm.effective_from, rmm.uom,
 *  r.status, r.id, r.name, r.make, r.type, r.hsn_code, r.rm_code, r.inci_name
 */
export type RMByMfg = {
  /** Primary key of the rm_mrm_fixed rate row — used for approval entity_id. */
  rate_id: number | null
  rm_id: number
  mfg_id: number | null
  mfg_code: string | null
  approved_vendor_id: number | null
  approved_vendor_code: string | null
  curr_rate: string | null
  effective_from: string | null
  uom: string | null
  /** Status of the base RM record (master_rm.status). */
  status: string | null
  /** Status of the rate row in rm_mrm_fixed — used for approval badges. */
  rate_status: string | null
  id: number
  name: string
  make: string | null
  type: string | null
  hsn_code: string | null
  rm_code: string | null
  inci_name: string | null
}

/** `pm` table — Packing Materials. Used by app/masters/packing-materials. */
export type PM = {
  id: number
  pm_code: string | null
  name: string
  type: string | null
  hsn_code: string | null
  uom: string | null
  status: string | null
}

/** Product Material rate row joined with VENDOR rate master (`pm_vrm`).
 *  Used by app/masters/product-materials vendor view.
 */
export type PMVendor = {
  pm_code: string | null
  name: string
  type: string | null
  hsn_code: string | null
  pm_id: number
  /** Primary key of the pm_vrm_dynamic rate row — for approval flow. */
  vrm_id: number | null
  vendor_id: number | null
  vendor_code: string | null
  curr_rate: string | null
  moq: number | null
  uom: string | null
  status: string | null
  effective_from: string | null
  effective_to: string | null
}

/** Product Material rate row joined with MANUFACTURER rate master (`pm_mrm`).
 *  Used by app/masters/product-materials manufacturer view.
 */
export type PMByMfg = {
  pm_code: string | null
  name: string
  type: string | null
  hsn_code: string | null
  uom: string | null
  pm_id: number
  /** Primary key of the pm_mrm_fixed rate row — used for approval entity_id. */
  rate_id: number | null
  mfg_id: number | null
  mfg_code: string | null
  curr_rate: string | null
  /** Status of the pm_mrm_fixed rate row — used for approval badges. */
  status: string | null
  effective_from: string | null
}


/**Bom Master - Bill of Material details */
export type BOM = {
  bom_code: string | null;
  bom_id: number | null;
  sku_code: string | null;
  mtrl_id: number | null;
  mtrl_type: string | null;
  uom: string | null;
  amount: number | null;
  mtrl_cost: number | null;
  material_status: string | null;
  bom_status: string | null;
  effective_from: Date | string | null;
  effective_till: Date | string | null;
  last_updated: Date | string | null;
  created_by: string | null;
  mtrl_name: string | null;
  mtrl_code: string | null;
  /** master_rm.status / master_pm.status for this line's material — distinct
   *  from material_status (the details_bom line's own status). Used to flag
   *  lines referencing a material that's since been deactivated. */
  mtrl_master_status: string | null;
};

/** One row per BOM header, used by the BOM Master listing page. */
export type BomListItem = {
  bom_id: number | null;
  bom_code: string | null;
  sku_code: string | null;
  sku_name: string | null;
  created_at: Date | string | null;
  effective_from: Date | string | null;
  effective_till: Date | string | null;
  status: string | null;
};

/** BOM detail side-panel payload: header + all material lines. */
export type BomDetailResponse = {
  bom_id: number | null;
  bom_code: string | null;
  sku_id: number | null;
  sku_code: string | null;
  status: string | null;
  created_at: Date | string | null;
  lines: BOM[];
};

export type bomType = {
  bom_code : string | null
  sku_code : string | null
  mfg_id : number | 0 
  created_by : number | 0 
  created_at : Date | null    
}
export type bom_detailsType = {

}