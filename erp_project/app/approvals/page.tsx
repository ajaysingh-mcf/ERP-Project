// Server component — fetches all pending approvals and passes them to the
// client for interactive approve / reject actions.

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { approvalsSql } from "@/lib/queries/approvals"
import ApprovalsClient from "./ApprovalsClient"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const rows = await query<any>(approvalsSql.listPending, [])
  const approvals = await Promise.all(
    rows.map(async (a) => ({
      ...a,
      items: await query<any>(approvalsSql.getItems, [a.id]),
    }))
  )

  const isApprover = session.user.roles?.some((r) => ["admin", "manager"].includes(r)) ?? false

  return <ApprovalsClient approvals={approvals} isApprover={isApprover} />
}
