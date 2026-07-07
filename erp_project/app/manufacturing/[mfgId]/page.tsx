import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect, notFound } from "next/navigation"
import { timedQuery } from "@/lib/query-timing"
import { manufacturingSql } from "@/lib/queries/manufacturing"
import { manufacturers as manufacturersSql } from "@/lib/queries/manufacturers"
import type { MfgLine } from "@/types/masters"
import ManufacturingLinesClient from "./ManufacturingLinesClient"

export const dynamic = "force-dynamic"

export default async function ManufacturerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ mfgId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/manufacturing")
  if (access === "none") redirect("/auth/unauthorized")

  const { mfgId } = await params
  const id = parseInt(mfgId)
  if (!Number.isFinite(id)) notFound()

  const sp = await searchParams
  const tabFilter = String(sp.tab ?? "active")
  const status = ["active", "on_hold", "tech_transfer"].includes(tabFilter) ? tabFilter : "active"

  const [mfgRows, lineRows, statusCountRows, bomOptions] = await Promise.all([
    timedQuery<{ id: number; code: string; name: string }>(manufacturersSql.selectNameById, [id]),
    timedQuery<MfgLine>(manufacturingSql.selectLinesByMfg, [id, status, status], { label: "manufacturing.selectLinesByMfg" }),
    timedQuery<{ status: string; cnt: number }>(manufacturingSql.statusCountsByMfg, [id], { label: "manufacturing.statusCountsByMfg" }),
    timedQuery<{ id: number; bom_code: string; sku_code: string | null; sku_name: string | null }>(manufacturingSql.bomOptionsForMfg, [id], { label: "manufacturing.bomOptionsForMfg" }),
  ])

  const mfg = mfgRows[0]
  if (!mfg) notFound()

  const statusCounts: Record<string, number> = { active: 0, on_hold: 0, tech_transfer: 0 }
  for (const r of statusCountRows) statusCounts[r.status] = Number(r.cnt)

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">{mfg.name}</h1>
        <p className="text-muted-foreground text-xs mt-0.5 font-mono">{mfg.code}</p>
      </div>
      <ManufacturingLinesClient
        mfgId={id}
        rows={lineRows}
        statusCounts={statusCounts}
        currentTab={status as "active" | "on_hold" | "tech_transfer"}
        bomOptions={bomOptions}
      />
    </div>
  )
}
