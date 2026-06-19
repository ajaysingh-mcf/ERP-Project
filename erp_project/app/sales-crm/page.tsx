import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"

export default async function Page() {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const access = await resolveAccess(userId, session.user.roles, "/sales-crm")
  if (access === "none") redirect("/auth/unauthorized")

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Sales & CRM</h1>
      <p className="text-muted-foreground text-sm mb-6">Access level: <strong className="text-foreground">{access}</strong></p>
      <p className="text-muted-foreground">Module coming soon.</p>
    </div>
  )
}
