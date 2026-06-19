// SERVER component for /masters/vendors.
// Gates access, reads vendor rows from the DB, and passes them to the client
// component. The interactive search/filter/add/CSV lives in VendorsClient.
import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { vendors } from "@/lib/queries/vendors"
import type { Vendor } from "@/types/masters"
import VendorsClient from "./VendorsClient"

export default async function VendorsPage() {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/masters")
  if (access === "none") redirect("/auth/unauthorized")

const rows = await query<Vendor>(vendors.selectAll)


  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All registered vendors
        </p>
      </div>
      <VendorsClient initialRows={rows} />
    </div>
  )
}
