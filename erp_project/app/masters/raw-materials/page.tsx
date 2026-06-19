// SERVER component for /masters/raw-materials.
// Gates access, then LAZILY queries only the rate master for the selected view
// (driven by the `?view=` search param). Vendor is the default; the rm_mrm
// (manufacturer) query runs only when the user switches to that view.
import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { rawMaterials } from "@/lib/queries/raw-materials"
import { vendors as vendorSql } from "@/lib/queries/vendors"
import { manufacturers as mfgSql } from "@/lib/queries/manufacturers"
import type { RM, RMByMfg, Vendor, Mfg } from "@/types/masters"
import { ViewToggle } from "./ViewToggle"
import VendorRawMaterialsClient from "./VendorRawMaterialsClient"
import ManufacturerRawMaterialsClient from "./ManufacturerRawMaterialsClient"

export default async function RawMaterialsPage({
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

  // Fetch vendor + manufacturer lists in parallel (needed for the Add wizard).
  const [vendorList, mfgList] = await Promise.all([
    query<Vendor>(vendorSql.selectAll),
    query<Mfg>(mfgSql.selectAll),
  ])

  let body: React.ReactNode
  if (isMfg) {
    const mfgRows = await query<RMByMfg>(rawMaterials.selectByManufacturer)
    body = <ManufacturerRawMaterialsClient rows={mfgRows} vendors={vendorList} manufacturers={mfgList} />
  } else {
    const vendorRows = await query<RM>(rawMaterials.selectByVendor)
    body = <VendorRawMaterialsClient rows={vendorRows} vendors={vendorList} manufacturers={mfgList} />
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Raw Materials</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All raw material (RM) master records
        </p>
      </div>
      <ViewToggle active={isMfg ? "manufacturer" : "vendor"} />
      {body}
    </div>
  )
}
