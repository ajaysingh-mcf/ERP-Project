// Server component — fetches all pending approvals and passes them to the
// client for interactive approve / reject actions.

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { approvalsSql, entityLabelSql } from "@/lib/queries/approvals"
import ApprovalsClient from "./ApprovalsClient"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const rows = await query<any>(approvalsSql.listPending, [])
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

  const isApprover = session.user.roles?.some((r) => ["admin", "manager"].includes(r)) ?? false

  return <ApprovalsClient approvals={approvals} isApprover={isApprover} />
}
