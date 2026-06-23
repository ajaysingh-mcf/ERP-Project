/**
 * SERVER component for /masters/material-master.
 *
 * Responsibilities:
 *   1. Auth + permission guard (unchanged).
 *   2. Determine which material type is active (?material=rm|pm).
 *   3. Read pagination + filter params (?page, ?size, ?search, ?status).
 *   4. Run a DB-level LIMIT/OFFSET query for the active material type.
 *   5. Hand the paginated slice + metadata to MaterialMasterClient.
 */

import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { parsePaginationParams, paginate } from "@/lib/pagination"
import { rawMaterials } from "@/lib/queries/raw-materials"
import { packingMaterials as PMMaterials } from "@/lib/queries/packing-materials"
import { MaterialToggle } from "./MaterialToggle"
import MaterialMasterClient from "./MaterialMasterClient"

type AnyRow = Record<string, unknown>

export default async function MaterialMasterPage({
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
  const sp    = await searchParams
  const isPm  = String(sp.material ?? "") === "pm"
  const { page, size, offset } = parsePaginationParams(sp)
  const search       = String(sp.search ?? "")
  const statusFilter = String(sp.status ?? "")

  const like   = search       ? `%${search}%` : null
  const status = statusFilter ? statusFilter  : null

  // ── DB-level paginated fetch ───────────────────────────────────────────────
  // Params: [like×4 (null-check + code + name + make/type), status×2, LIMIT, OFFSET]
  const { rows, total } = await paginate<AnyRow>(
    isPm ? PMMaterials.selectPaginated : rawMaterials.selectPaginated,
    [like, like, like, like, status, status, size, offset],
    isPm ? PMMaterials.countAll        : rawMaterials.countAll,
    [like, like, like, like, status, status],
    page,
    size
  )

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Material Master</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All raw and packing material master records
        </p>
      </div>
      <MaterialToggle material={isPm ? "pm" : "rm"} />
      <MaterialMasterClient
        material={isPm ? "pm" : "rm"}
        rows={rows}
        total={total}
        page={page}
        pageSize={size}
        currentSearch={search}
        currentStatus={statusFilter}
      />
    </div>
  )
}
