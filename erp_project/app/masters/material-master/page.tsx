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
import { parsePaginationParams } from "@/lib/pagination"
import { timedQuery } from "@/lib/query-timing"
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
  const pageStart = performance.now()
  const material = isPm ? "pm" : "rm"
  console.log(`[AUDIT] Material Master load - material=${material}, page=${page}, size=${size}, search=${search || "none"}, status=${status || "all"}`)

  const [rows, countRows] = await Promise.all([
    timedQuery<AnyRow>(isPm ? PMMaterials.selectPaginated : rawMaterials.selectPaginated, [like, like, like, like, status, status, size, offset], { label: "selectPaginated" }),
    timedQuery<{ total: number }>(isPm ? PMMaterials.countAll : rawMaterials.countAll, [like, like, like, like, status, status], { label: "countAll" }),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  console.log(`[AUDIT] Material Master complete: ${(performance.now() - pageStart).toFixed(2)}ms | ${rows.length}/${total} rows`)

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
