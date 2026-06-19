import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import type { BOM } from "@/types/masters"
import { bom } from "@/lib/queries/bom_master"
import BOMMasterComponent from "./BOMMasterComponent"

export default async function BOMMasterPage() {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/masters")
  if (access === "none") redirect("/auth/unauthorized")

  let rows: BOM[] = []
  try {
    rows = await query<BOM>(bom.selectAll)
  } catch (error) {
    console.error("Error fetching BOM details:", error)
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">BOM Master</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bill of Materials — all active component definitions
        </p>
      </div>
      <BOMMasterComponent initialRows={rows} />
    </div>
  )
}
