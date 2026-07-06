/**
 * SERVER component for /masters/bom-master/history.
 *
 * Read-only counterpart to /masters/bom-master: lists BOM headers that have
 * at least one archived revision in history_bom (a BOM only gets one once an
 * "update existing BOM" approval has been applied — see
 * lib/approvals/module-handlers.ts bomHandler). Reuses the same paginated
 * grouped-listing query shape as the live page so BomTable/BomListItem work
 * unmodified.
 */

import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { parsePaginationParams } from "@/lib/pagination"
import { timedQuery } from "@/lib/query-timing"
import { bom } from "@/lib/queries/bom"
import type { BomListItem } from "@/types/masters"
import BomHistoryClient from "./BomHistoryClient"

export default async function BOMHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/masters")
  if (access === "none") redirect("/auth/unauthorized")

  const sp     = await searchParams
  const { page, size, offset } = parsePaginationParams(sp)
  const search = String(sp.search ?? "")
  const like   = search ? `%${search}%` : null

  const pageStart = performance.now()
  console.log(`[AUDIT] BOM History load - page=${page}, size=${size}, search=${search || "none"}`)

  const [rows, countRows] = await Promise.all([
    timedQuery<BomListItem>(bom.selectHistoryPaginatedGrouped, [like, like, like, size, offset], { label: "selectHistoryPaginatedGrouped" }),
    timedQuery<{ total: number }>(bom.countHistoryGrouped, [like, like, like], { label: "countHistoryGrouped" }),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  console.log(`[AUDIT] BOM History complete: ${(performance.now() - pageStart).toFixed(2)}ms | ${rows.length}/${total} rows`)

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">BOM History</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Archived formulations — every BOM that has been revised at least once
        </p>
      </div>
      <BomHistoryClient
        rows={rows}
        total={total}
        page={page}
        pageSize={size}
        currentSearch={search}
      />
    </div>
  )
}
