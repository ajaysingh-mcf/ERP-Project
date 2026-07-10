// The MFG Overview list that used to live here moved to
// /po-tracking/mfg-overview (see app/po-tracking/mfg-overview/page.tsx) — the
// sidebar groups it under Production Tracking now. This bare route just
// forwards to the first manufacturer's Cost Manager page (same order as the
// sidebar's MFG Cost Manager list — manufacturingSql.selectActiveForNav).
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { query } from "@/lib/db"
import { manufacturingSql } from "@/lib/queries/manufacturing"

export const dynamic = "force-dynamic"

export default async function ManufacturingRootPage() {
  const session = await auth()
  if (!session) redirect("/auth/signin")

  const rows = await query<{ id: number; name: string }>(manufacturingSql.selectActiveForNav, [])
  const first = rows[0]
  if (!first) redirect("/auth/unauthorized")

  redirect(`/manufacturing/${first.id}`)
}
