/**
 * SERVER component for /masters/packing-materials.
 *
 * Responsibilities:
 *   1. Auth + permission guard (unchanged).
 *   2. Determine which view is active (?view=vendor|manufacturer).
 *   3. Read pagination + filter params (?page, ?size, ?search, ?status).
 *   4. Run a DB-level LIMIT/OFFSET query for the ACTIVE view only.
 *   5. Fetch the full vendor/mfg lists for the Add-wizard dropdowns (selectAll —
 *      these are small reference sets, not paginated).
 *   6. Hand the paginated slice + metadata to the appropriate client component.
 */

import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { parsePaginationParams, paginate } from "@/lib/pagination"
import { PMMaterials } from "@/lib/queries/packing-materials"
import { vendors as vendorSql } from "@/lib/queries/vendors"
import { manufacturers as mfgSql } from "@/lib/queries/manufacturers"
import type { PMVendor, PMByMfg, Vendor, Mfg } from "@/types/masters"
import { ViewToggle } from "./ViewToggle"
import VendorPackingMaterialsClient from "./VendorPackingMaterialsClient"
import ManufacturerPackingMaterialsClient from "./ManufacturerPackingMaterialsClient"

export default async function PackingMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // ── Auth + permission guard ────────────────────────────────────────────────
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/masters")
  if (access === "none") redirect("/auth/unauthorized")

  // ── Read URL params ────────────────────────────────────────────────────────
  const sp     = await searchParams
  const isMfg  = String(sp.view ?? "") === "manufacturer"
  const { page, size, offset } = parsePaginationParams(sp)
  const search       = String(sp.search ?? "")
  const statusFilter = String(sp.status ?? "")

  const like   = search       ? `%${search}%` : null
  const status = statusFilter ? statusFilter  : null

  // ── Parallel fetch: reference lists + paginated view data ─────────────────
  // vendorList and mfgList are always fetched in full — they power the Add wizard's
  // dropdowns and are small enough that no pagination is needed.
  const [vendorList, mfgList] = await Promise.all([
    query<Vendor>(vendorSql.selectAll),
    query<Mfg>(mfgSql.selectAll),
  ])

  let body: React.ReactNode

  if (isMfg) {
    // Manufacturer view — query pm_mrm × pm
    // Param order: [like×3, status×2, LIMIT, OFFSET] (data) / [like×3, status×2] (count)
    const { rows, total } = await paginate<PMByMfg>(
      PMMaterials.selectMfgPaginated,
      [like, like, like, status, status, size, offset],
      PMMaterials.countMfg,
      [like, like, like, status, status],
      page,
      size
    )
    body = (
      <ManufacturerPackingMaterialsClient
        rows={rows}
        vendors={vendorList}
        manufacturers={mfgList}
        total={total}
        page={page}
        pageSize={size}
        currentSearch={search}
        currentStatus={statusFilter}
      />
    )
  } else {
    // Vendor view (default) — query pm_vrm × pm
    const { rows, total } = await paginate<PMVendor>(
      PMMaterials.selectVendorPaginated,
      [like, like, like, status, status, size, offset],
      PMMaterials.countVendor,
      [like, like, like, status, status],
      page,
      size
    )
    body = (
      <VendorPackingMaterialsClient
        rows={rows}
        vendors={vendorList}
        manufacturers={mfgList}
        total={total}
        page={page}
        pageSize={size}
        currentSearch={search}
        currentStatus={statusFilter}
      />
    )
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Packing Materials</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All packing material (PM) master records
        </p>
      </div>
      <ViewToggle active={isMfg ? "manufacturer" : "vendor"} />
      {body}
    </div>
  )
}
