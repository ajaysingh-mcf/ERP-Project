import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { parsePaginationParams } from "@/lib/pagination"
import { timedQuery } from "@/lib/query-timing"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import type { PoRow } from "./po-types"
import PoProcurementClient from "./PoProcurementClient"

export const dynamic = "force-dynamic"

export default async function PoProcurementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/po-tracking")
  if (access === "none") redirect("/auth/unauthorized")

  const sp           = await searchParams
  const { page, size, offset } = parsePaginationParams(sp)
  const search       = String(sp.search ?? "")
  const statusFilter = String(sp.status ?? "")

  const like   = search       ? `%${search}%`  : null
  const status = statusFilter ? statusFilter    : null

  const searchParams6 = [like, like, like, like, like, like]

  const pageStart = performance.now()
  console.log(`[AUDIT] PO Procurement load - page=${page}, size=${size}, search=${search || "none"}, status=${status || "all"}`)

  const [rows, countRows, statusCountRows, summaryRows, skus, mfgs, warehouses] = await Promise.all([
    timedQuery<PoRow>(purchaseOrdersSql.selectPaginated, [...searchParams6, status, status, size, offset], { label: "selectPaginated" }),
    timedQuery<{ total: number }>(purchaseOrdersSql.countPaginated, [...searchParams6, status, status], { label: "countPaginated" }),
    timedQuery<{ status: string; cnt: number }>(purchaseOrdersSql.statusCounts, searchParams6, { label: "statusCounts" }),
    timedQuery<any>(purchaseOrdersSql.summaryStats, searchParams6, { label: "summaryStats" }),
    timedQuery<any>(purchaseOrdersSql.skuOptions, [], { label: "skuOptions" }),
    timedQuery<any>(purchaseOrdersSql.mfgOptions, [], { label: "mfgOptions" }),
    timedQuery<any>(purchaseOrdersSql.warehouseOptions, [], { label: "warehouseOptions" }),
  ])

  const total = Number(countRows[0]?.total ?? 0)
  console.log(`[AUDIT] PO Procurement complete: ${(performance.now() - pageStart).toFixed(2)}ms | ${rows.length}/${total} rows`)

  const statusCounts: Record<string, number> = { all: total }
  for (const r of statusCountRows) statusCounts[r.status] = Number(r.cnt)

  const s = summaryRows[0] ?? {}
  const summary = {
    total:             Number(s.total            ?? 0),
    raised:            Number(s.raised           ?? 0),
    punched:           Number(s.punched          ?? 0),
    partiallyReceived: Number(s.partially_received ?? 0),
    openValue:         Number(s.open_value        ?? 0),
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">PO Procurement</h1>
        <p className="text-muted-foreground text-xs mt-0.5">
          Track finished-goods purchase orders from raise through receipt.
        </p>
      </div>
      <PoProcurementClient
        rows={rows}
        total={total}
        page={page}
        pageSize={size}
        currentSearch={search}
        currentStatus={statusFilter}
        statusCounts={statusCounts}
        summary={summary}
        skuOptions={skus}
        mfgOptions={mfgs}
        warehouseOptions={warehouses}
        sessionUserId={userId}
      />
    </div>
  )
}
