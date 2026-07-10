import Link from "next/link"
import { auth } from "@/lib/auth"
import { resolveAccess } from "@/lib/permissions"
import { redirect } from "next/navigation"

// `built: false` routes have no page.tsx yet — prefetch={false} on their
// Link stops Next from firing a background fetch that just 404s.
const modules = [
  { name: "HR & Payroll",         slug: "/hr-payroll",    description: "Employee management, attendance, payroll processing", built: false },
  { name: "Inventory",            slug: "/inventory",     description: "Stock management, warehousing, procurement", built: false },
  { name: "Sales & CRM",          slug: "/sales-crm",     description: "Orders, invoicing, customer management", built: false },
  { name: "Finance & Accounting", slug: "/finance",       description: "GL, AP/AR, financial reporting", built: false },
  { name: "Masters",              slug: "/masters",       description: "Master data: SKUs, vendors, manufacturers, materials", built: true },
  { name: "Reports & Analytics",  slug: "/reports",       description: "Dashboards, KPIs, data exports", built: false },
  { name: "Manufacturing",        slug: "/manufacturing", description: "Production planning, BOMs, work orders", built: true },
  { name: "Sheet Viewer",         slug: "/sheet-viewer",  description: "Preview published Google Sheets in a table", built: true },
]

export default async function Home() {
  const session = await auth()
  if (!session) redirect("/auth/signin")
  const userId = parseInt(session.user.id)
  const roles = session.user.roles ?? []

  const accessLevels = await Promise.all(
    modules.map(m => resolveAccess(userId, roles, m.slug))
  )

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Production Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Welcome back, {session.user.name ?? "User"}. Select a module to get started.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod, i) => {
          const access = accessLevels[i]
          const hasAccess = access !== "none"

          if (!hasAccess) {
            return (
              <div
                key={mod.slug}
                className="rounded-xl border border-border p-5 bg-muted/30 opacity-50 cursor-not-allowed"
              >
                <h3 className="font-semibold text-sm mb-1">{mod.name}</h3>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
                <span className="text-xs text-muted-foreground/60 mt-2 inline-block">No access</span>
              </div>
            )
          }

          return (
            <Link
              key={mod.slug}
              href={mod.slug}
              prefetch={mod.built}
              className="rounded-xl border border-border p-5 bg-card hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <h3 className="font-semibold text-sm mb-1">{mod.name}</h3>
              <p className="text-xs text-muted-foreground">{mod.description}</p>
              <span className="text-xs text-primary mt-2 inline-block capitalize font-medium">{access}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
