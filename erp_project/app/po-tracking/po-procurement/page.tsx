import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { purchaseOrdersSql } from "@/lib/queries/purchase-orders"
import PoProcurementClient from "./PoProcurementClient"

export const dynamic = "force-dynamic"

export default async function PoProcurementPage() {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/po-tracking")
  if (access === "none") redirect("/auth/unauthorized")

  const [rows, skus, mfgs, warehouses] = await Promise.all([
    query<any>(purchaseOrdersSql.selectAll, []),
    query<any>(purchaseOrdersSql.skuOptions, []),
    query<any>(purchaseOrdersSql.mfgOptions, []),
    query<any>(purchaseOrdersSql.warehouseOptions, []),
  ])

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">PO Procurement</h1>
        <p className="text-muted-foreground text-xs mt-0.5">
          Track finished-goods purchase orders from raise through receipt.
        </p>
      </div>
      <PoProcurementClient
        initialRows={rows}
        skuOptions={skus}
        mfgOptions={mfgs}
        warehouseOptions={warehouses}
        sessionUserId={userId}
      />
    </div>
  )
}
