/**
 * SERVER component for /masters/skus.
 *
 * Reads ?page, ?size, ?search, ?status from URL searchParams and runs a
 * DB-level LIMIT/OFFSET query so only the requested slice is fetched.
 *
 * The inline SQL that previously lived here has been extracted to
 * lib/queries/skus.ts to follow the same pattern as every other master module.
 */

import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { parsePaginationParams } from "@/lib/pagination"
import { timedQuery } from "@/lib/query-timing"
import { skus as skuSql } from "@/lib/queries/skus"
import type { Sku } from "@/types/masters"
import SkusClient from "./SkusClient"

export default async function SkusPage({
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
  const sp           = await searchParams
  const { page, size, offset } = parsePaginationParams(sp)
  const search       = String(sp.search ?? "")
  const statusFilter = String(sp.status ?? "")

  const like   = search       ? `%${search}%` : null
  const status = statusFilter ? statusFilter  : null

  // ── DB query (paginated) ───────────────────────────────────────────────────
  // Param order: [like×4, status×2, LIMIT, OFFSET] (data) / [like×4, status×2] (count)
  const pageStart = performance.now()
  console.log(`[AUDIT] SKUs load - page=${page}, size=${size}, search=${search || "none"}, status=${status || "all"}`)

  const [rows, countRows] = await Promise.all([
    timedQuery<Sku>(skuSql.selectPaginated, [like, like, like, like, status, status, size, offset], { label: "selectPaginated" }),
    timedQuery<{ total: number }>(skuSql.countAll, [like, like, like, like, status, status], { label: "countAll" }),
  ])

  const total = Number(countRows[0]?.total ?? 0)
  console.log(`[AUDIT] SKUs complete: ${(performance.now() - pageStart).toFixed(2)}ms | ${rows.length}/${total} rows`)

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">SKUs</h1>
        <p className="text-muted-foreground text-sm mt-1">Master list of all Stock Keeping Units</p>
      </div>
      <SkusClient
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
