/**
 * Cached reference-data lookups.
 *
 * These are small, rarely-changing lists (vendors, manufacturers, distinct
 * type/make dropdowns, PO dropdown options) that were previously re-queried
 * on every single masters/PO page load. Wrapping them in `unstable_cache`
 * removes those redundant round-trips without adding any new infrastructure.
 *
 * Revalidation is time-based (REVALIDATE_SECONDS) rather than tag-driven —
 * a new vendor/manufacturer/material can take up to that long to appear in
 * dropdowns after approval. If that staleness window becomes a problem,
 * call `revalidateTag()` with the relevant tag right after the approval
 * commits in the module handler instead of shortening this window.
 */

import { unstable_cache } from "next/cache"
import { timedQuery } from "@/lib/query-timing"
import { vendors as vendorSql } from "@/lib/queries/vendors"
import { manufacturers as mfgSql } from "@/lib/queries/manufacturers"
import { rawMaterials } from "@/lib/queries/raw-materials"
import { packingMaterials } from "@/lib/queries/packing-materials"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import type { Vendor, Mfg } from "@/types/masters"

const REVALIDATE_SECONDS = 120

export const getVendorReferenceList = unstable_cache(
  () => timedQuery<Vendor>(vendorSql.selectAll, [], { label: "vendors.selectAll (cached)" }),
  ["ref-vendor-list"],
  { revalidate: REVALIDATE_SECONDS, tags: ["ref:vendors"] }
)

export const getManufacturerReferenceList = unstable_cache(
  () => timedQuery<Mfg>(mfgSql.selectAll, [], { label: "manufacturers.selectAll (cached)" }),
  ["ref-mfg-list"],
  { revalidate: REVALIDATE_SECONDS, tags: ["ref:manufacturers"] }
)

export const getRmDistinctMakes = unstable_cache(
  () => timedQuery<{ make: string }>(rawMaterials.selectDistinctMakes, [], { label: "rm.selectDistinctMakes (cached)" }),
  ["ref-rm-makes"],
  { revalidate: REVALIDATE_SECONDS, tags: ["ref:rm"] }
)

export const getRmDistinctTypes = unstable_cache(
  () => timedQuery<{ type: string }>(rawMaterials.selectDistinctTypes, [], { label: "rm.selectDistinctTypes (cached)" }),
  ["ref-rm-types"],
  { revalidate: REVALIDATE_SECONDS, tags: ["ref:rm"] }
)

export const getRmDistinctInciNames = unstable_cache(
  () => timedQuery<{ inci_name: string }>(rawMaterials.selectDistinctInciNames, [], { label: "rm.selectDistinctInciNames (cached)" }),
  ["ref-rm-inci-names"],
  { revalidate: REVALIDATE_SECONDS, tags: ["ref:rm"] }
)

export const getPmDistinctTypes = unstable_cache(
  () => timedQuery<{ make: string }>(packingMaterials.selectDistinctMakes, [], { label: "pm.selectDistinctMakes (cached)" }),
  ["ref-pm-types"],
  { revalidate: REVALIDATE_SECONDS, tags: ["ref:pm"] }
)

export const getPoDropdownOptions = unstable_cache(
  async () => {
    const [skus, mfgs, warehouses] = await Promise.all([
      timedQuery<any>(purchaseOrdersSql.skuOptions, [], { label: "po.skuOptions (cached)" }),
      timedQuery<any>(purchaseOrdersSql.mfgOptions, [], { label: "po.mfgOptions (cached)" }),
      timedQuery<any>(purchaseOrdersSql.warehouseOptions, [], { label: "po.warehouseOptions (cached)" }),
    ])
    return { skus, mfgs, warehouses }
  },
  ["ref-po-dropdown-options"],
  { revalidate: REVALIDATE_SECONDS, tags: ["ref:po-options"] }
)
