import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { parsePaginationParams } from "@/lib/pagination"
import { timedQuery } from "@/lib/query-timing"
import { purchaseOrdersSql, buildFilterParams, buildStatusCountParams } from "@/lib/queries/purchase-orders"
import { getPoDropdownOptions } from "@/lib/cached-reference-data"
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

  const sp              = await searchParams
  const { page, size, offset } = parsePaginationParams(sp)
  const search          = String(sp.search      ?? "")
  const statusFilter    = String(sp.status      ?? "")
  const sortBy          = String(sp.sortBy      ?? "date")
  const sortDir         = (String(sp.sortDir    ?? "desc") === "asc" ? "asc" : "desc") as "asc" | "desc"
  const mfgCode         = String(sp.mfgCode     ?? "")
  const poType          = String(sp.poType      ?? "")
  const dateFrom        = String(sp.dateFrom    ?? "")
  const dateTo          = String(sp.dateTo      ?? "")
  const skuFilter       = String(sp.sku         ?? "")
  const destFilter      = String(sp.destination ?? "")

  const status = statusFilter || null

  const filterParams      = buildFilterParams(search || null, status, mfgCode || null, poType || null, dateFrom || null, dateTo || null, skuFilter || null, destFilter || null)
  const statusCountParams = buildStatusCountParams(search || null, mfgCode || null, poType || null, dateFrom || null, dateTo || null, skuFilter || null, destFilter || null)

  const pageStart = performance.now()
  console.log(`[AUDIT] PO Procurement load - page=${page}, size=${size}, search=${search || "none"}, status=${status ?? "all"}, sortBy=${sortBy}, sortDir=${sortDir}`)

  const [rows, countRows, statusCountRows, summaryRows, dropdownOptions] = await Promise.all([
    timedQuery<PoRow>(purchaseOrdersSql.buildSelectPaginated(sortBy, sortDir), [...filterParams, size, offset], { label: "selectPaginated" }),
    timedQuery<{ total: number }>(purchaseOrdersSql.countPaginated, filterParams, { label: "countPaginated" }),
    timedQuery<{ status: string; cnt: number }>(purchaseOrdersSql.statusCounts, statusCountParams, { label: "statusCounts" }),
    timedQuery<any>(purchaseOrdersSql.summaryStats, statusCountParams, { label: "summaryStats" }),
    getPoDropdownOptions(),
  ])
  const { skus, mfgs, warehouses } = dropdownOptions

  const total = Number(countRows[0]?.total ?? 0)
  console.log(`[AUDIT] PO Procurement complete: ${(performance.now() - pageStart).toFixed(2)}ms | ${rows.length}/${total} rows`)

  const statusCounts: Record<string, number> = {}
  for (const r of statusCountRows) statusCounts[r.status] = Number(r.cnt)
  statusCounts.all = Object.values(statusCounts).reduce((sum, n) => sum + n, 0)

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
        currentSortBy={sortBy}
        currentSortDir={sortDir}
        currentMfgCode={mfgCode}
        currentPoType={poType}
        currentDateFrom={dateFrom}
        currentDateTo={dateTo}
        currentSku={skuFilter}
        currentDestination={destFilter}
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
