// SERVER component for /po-tracking/po-procurement.
//
// This page is a UI prototype driven by MOCK data (see ./mock-data.ts), so there
// is no database query here. We still keep the same access gate the rest of the
// app uses — require a signed-in session AND a non-"none" permission for the
// "/po-tracking" page slug — then hand off to the interactive client component.
import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import PoProcurementClient from "./PoProcurementClient"

export default async function PoProcurementPage() {
  // --- Auth + permission gate ----------------------------------------------
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/po-tracking")
  if (access === "none") redirect("/auth/unauthorized")

  // --- Render: heading + interactive client (client owns the mock data) -----
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">PO Procurement</h1>
        <p className="text-muted-foreground text-xs mt-0.5">
          Track finished-goods purchase orders from raise through dispatch and receipt.
        </p>
      </div>
      <PoProcurementClient />
    </div>
  )
}
