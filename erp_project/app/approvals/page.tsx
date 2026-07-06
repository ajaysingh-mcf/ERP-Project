// Server component — fetches all pending approvals and passes them to the
// client for interactive approve / reject actions.
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { timedQuery } from "@/lib/query-timing"
import { approvalsSql, entityLabelSql } from "@/lib/queries/approvals"
import { getActiveRmMaterialOptions, getActivePmMaterialOptions } from "@/lib/cached-reference-data"
import { buildMaterialMap } from "./material-map"
import ApprovalsClient from "./ApprovalsClient"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const pageStart = performance.now()
  console.log(`[AUDIT] Approvals load`)

  const [rows, rmRows, pmRows] = await Promise.all([
    timedQuery<any>(approvalsSql.listPending, [], { label: "listPending" }),
    getActiveRmMaterialOptions(),
    getActivePmMaterialOptions(),
  ])
  const approvals = await Promise.all(
    rows.map(async (a) => {
      const [items, labelRows] = await Promise.all([
        query<any>(approvalsSql.getItems, [a.id]),
        entityLabelSql[a.module]
          ? query<any>(entityLabelSql[a.module], [a.entity_id])
          : Promise.resolve([]),
      ])
      const label = labelRows[0] ?? {}
      return {
        ...a,
        items,
        entity_code:           label.code           ?? null,
        entity_name:           label.name           ?? null,
        entity_secondary_code: label.secondary_code ?? null,
        entity_secondary_name: label.secondary_name ?? null,
      }
    })
  )

  console.log(`[AUDIT] Approvals complete: ${(performance.now() - pageStart).toFixed(2)}ms | ${approvals.length} pending`)

  const isApprover = session.user.roles?.some((r) => ["admin", "manager"].includes(r)) ?? false

  return (
    <ApprovalsClient
      approvals={approvals}
      isApprover={isApprover}
      materialMap={buildMaterialMap(rmRows, pmRows)}
    />
  )
}
