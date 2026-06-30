/**
 * SERVER component for /masters/bom-master.
 *
 * Reads ?page, ?size, ?search, ?type, ?status from URL searchParams and runs a
 * DB-level LIMIT/OFFSET query so only the requested slice is fetched.
 */

import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { parsePaginationParams } from "@/lib/pagination"
import { timedQuery } from "@/lib/query-timing"
import { bom } from "@/lib/queries/bom"
import type { BOM } from "@/types/masters"
import BOMMasterComponent from "./BOMMasterComponent"

export default async function BOMMasterPage({
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
  const sp            = await searchParams
  const { page, size, offset } = parsePaginationParams(sp)
  const search        = String(sp.search ?? "")
  const typeFilter    = String(sp.type   ?? "")
  const statusFilter  = String(sp.status ?? "")

  const like   = search       ? `%${search}%` : null
  const type   = typeFilter   ? typeFilter    : null
  const status = statusFilter ? statusFilter  : null

  // ── DB query (paginated) ───────────────────────────────────────────────────
  // Param order: [like×3, type×2, status×2, LIMIT, OFFSET] (data)
  //              [like×3, type×2, status×2]                (count)
  const pageStart = performance.now()
  console.log(`[AUDIT] BOM Master load - page=${page}, size=${size}, search=${search || "none"}, type=${type || "all"}, status=${status || "all"}`)

  const [rows, countRows] = await Promise.all([
    timedQuery<BOM>(bom.selectPaginated, [like, like, like, type, type, status, status, size, offset], { label: "selectPaginated" }),
    timedQuery<{ total: number }>(bom.countAll, [like, like, like, type, type, status, status], { label: "countAll" }),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  console.log(`[AUDIT] BOM Master complete: ${(performance.now() - pageStart).toFixed(2)}ms | ${rows.length}/${total} rows`)

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">BOM Master</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bill of Materials — all active component definitions
        </p>
      </div>
      <BOMMasterComponent
        rows={rows}
        total={total}
        page={page}
        pageSize={size}
        currentSearch={search}
        currentType={typeFilter}
        currentStatus={statusFilter}
      />
    </div>
  )
}
