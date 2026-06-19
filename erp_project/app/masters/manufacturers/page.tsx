import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import type { Mfg } from "@/types/masters"
import ManufacturersClient from "./ManufacturersClient"
import { manufacturers } from "@/lib/queries/manufacturers"

export default async function ManufacturersPage() {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/masters")
  if (access === "none") redirect("/auth/unauthorized")

  let rows: Mfg[] = []
  try {
    rows = await query<Mfg>(manufacturers.selectAll)
  } catch (error) {
    console.error("Error fetching manufacturers:", error)
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Manufacturers</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All registered manufacturers (MFGs)
        </p>
      </div>
      <ManufacturersClient initialRows={rows} />
    </div>
  )
}
