import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { PMMaterials } from "@/lib/queries/product-materials"
import { vendors as vendorSql } from "@/lib/queries/vendors"
import { manufacturers as mfgSql } from "@/lib/queries/manufacturers"
import type { PMVendor, PMByMfg, Vendor, Mfg } from "@/types/masters"
import { ViewToggle } from "./ViewToggle"
import VendorPackingMaterialsClient from "./VendorPackingMaterialsClient"
import ManufacturerPackingMaterialsClient from "./ManufacturerPackingMaterialsClient"

export default async function PackingMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/masters")
  if (access === "none") redirect("/auth/unauthorized")

  const { view } = await searchParams
  const isMfg = view === "manufacturer"

  const [vendorList, mfgList] = await Promise.all([
    query<Vendor>(vendorSql.selectAll),
    query<Mfg>(mfgSql.selectAll),
  ])

  let body: React.ReactNode
  if (isMfg) {
    const rows = await query<PMByMfg>(PMMaterials.selectAllByManufacturer)
    body = <ManufacturerPackingMaterialsClient rows={rows} vendors={vendorList} manufacturers={mfgList} />
  } else {
    const rows = await query<PMVendor>(PMMaterials.selectAllByVendor)
    body = <VendorPackingMaterialsClient rows={rows} vendors={vendorList} manufacturers={mfgList} />
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Packing Materials</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All packing material (PM) master records
        </p>
      </div>
      <ViewToggle active={isMfg ? "manufacturer" : "vendor"} />
      {body}
    </div>
  )
}
