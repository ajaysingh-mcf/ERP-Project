import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { rawMaterials } from "@/lib/queries/raw-materials"
import { PMMaterials } from "@/lib/queries/product-materials"
import { MaterialToggle } from "./MaterialToggle"
import MaterialMasterClient from "./MaterialMasterClient"

type AnyRow = Record<string, unknown>

export default async function MaterialMasterPage({searchParams,}: {searchParams: Promise<{ material?: string } > }) {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/masters")
  if (access === "none") redirect("/auth/unauthorized")

  const { material } = await searchParams
  const isPm = material === "pm"

  // Fetch only the base table rows — no vendor/mfg rate joins needed here.
  const rows = await query<AnyRow>(
    isPm ? PMMaterials.selectAll : rawMaterials.selectAll
  )

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Material Master</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All raw and packing material master records
        </p>
      </div>
      <MaterialToggle material={isPm ? "pm" : "rm"} />
      <MaterialMasterClient material={isPm ? "pm" : "rm"} rows={rows} />
    </div>
  )
}
