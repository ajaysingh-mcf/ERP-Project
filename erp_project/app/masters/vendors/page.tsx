/**
 * SERVER component for /masters/vendors.
 *
 * Responsibilities:
 *   1. Auth + page-permission guard (unchanged).
 *   2. Read pagination params (?page, ?size) and filter params (?search, ?type)
 *      from the URL searchParams.
 *   3. Run a DB-level LIMIT/OFFSET query so only the requested slice is fetched.
 *   4. Hand the slice + metadata to the client component for rendering.
 *
 * The interactive toolbar (search box, type filter, Add, CSV import) and the
 * PaginationBar footer both live in VendorsClient.
 */

import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { parsePaginationParams, paginate } from "@/lib/pagination"
import { vendors } from "@/lib/queries/vendors"
import type { Vendor } from "@/types/masters"
import VendorsClient from "./VendorsClient"

export default async function VendorsPage({
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
  const sp         = await searchParams
  const { page, size, offset } = parsePaginationParams(sp)
  const search     = String(sp.search ?? "")
  const typeFilter = String(sp.type   ?? "")

  const fp = vendors.filterParams(search || null, typeFilter || null)

  const { rows, total } = await paginate<Vendor>(
    vendors.selectPaginated,
    [...fp, size, offset],
    vendors.countAll,
    fp,
    page,
    size
  )

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
        <p className="text-muted-foreground text-sm mt-1">All registered vendors</p>
      </div>
      <VendorsClient
        rows={rows}
        total={total}
        page={page}
        pageSize={size}
        currentSearch={search}
        currentType={typeFilter}
      />
    </div>
  )
}
