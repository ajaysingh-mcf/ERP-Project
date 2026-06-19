// SERVER component for /masters/skus.
// Responsibilities: gate access (auth + page permission), read the SKU rows
// from the DB, and hand them to the client component for rendering. No
// interactivity lives here — that's SkusClient's job.
import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import type { Sku } from "@/types/masters"
import SkusClient from "./SkusClient"

export default async function SkusPage() {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/masters")
  if (access === "none") redirect("/auth/unauthorized")

  const skus = await query<Sku>(
    "SELECT id, sku_code, name, brand, category, status, created_at, created_by FROM skus ORDER BY sku_code ASC"
  )



  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">SKUs</h1>
        <p className="text-muted-foreground text-sm mt-1">Master list of all Stock Keeping Units</p>
      </div>
      <SkusClient initialSkus={skus} />
    </div>
  )
}
