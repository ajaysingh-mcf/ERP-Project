"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Database, Factory, CalendarDays,
  Activity, DollarSign, CheckSquare, BarChart2,
  Settings, ChevronLeft, ChevronRight, ChevronDown, LogOut,
  Package, Truck, FlaskConical, Box, Dot
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { handleSignOut } from "@/app/actions/auth"

type NavChild = { label: string; href: string ,icon?:React.ElementType  }
type NavItem = {
  label: string
  href?: string
  icon: React.ElementType
  children?: NavChild[]
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "Masters", icon: Database,
    children: [
      { label: "SKUs",              href: "/masters/skus" , icon: (props) => <Dot className="text-blue-500" {...props} />  },
      { label: "Manufacturers",     href: "/masters/manufacturers" },
      { label: "Vendors",           href: "/masters/vendors" },
      { label: "RM Cost Master",     href: "/masters/raw-materials" },
      { label: "PM Cost Master", href: "/masters/packing-materials" },
      {label: "Bom Master" , href: "/masters/bom-master"},
      {label: "Material Master",     href:"/masters/material-master"}
    ],
  },
  { label: "Planning",            icon: CalendarDays, children: [] },
  // "PO Tracking" (formerly "Production Tracking") groups the purchase-order
  // workflow pages. Children render as a collapsible sub-list — the generic
  // logic further down (the `hasChildren` branch) handles open/close + active
  // highlighting, so adding entries here is all that's needed.
  {
    label: "PO Tracking", icon: Activity,
    children: [
      { label: "PO Procurement",    href: "/po-tracking/po-procurement" },
      { label: "RM/PM Procurement", href: "/po-tracking/rm-pm-procurement" },
      { label: "Dispatch Calendar", href: "/po-tracking/dispatch-calendar" },
    ],
  },
  {
    label: "Finance", icon: DollarSign,
    children: [{ label: "Finance & Accounting", href: "/finance" }],
  },
  { label: "Approvals", href: "/approvals", icon: CheckSquare },
  {
    label: "Reports", icon: BarChart2,
    children: [{ label: "Reports & Analytics", href: "/reports" }],
  },
  { label: "Settings", href: "/settings", icon: Settings },
]

interface SidebarProps {
  user?: { name?: string | null; email?: string | null }
  mfgs?: { id: number; name: string }[]
}

// Sections with more children than this show only the first CHILD_CAP and
// collapse the rest behind a "Show more" toggle — keeps a growing list (e.g.
// manufacturers under MFG Management) from pushing every section below it
// down the sidebar.
const CHILD_CAP = 5

export default function Sidebar({ user, mfgs = [] }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState<string[]>(["Masters"])
  const [expandedSections, setExpandedSections] = useState<string[]>([])

  // MFG Management's children depend on the live manufacturer list (passed
  // down from the server), so this item is built per-render rather than
  // living in the static NAV array above.
  const nav: NavItem[] = [
    NAV[0], NAV[1],
    {
      label: "MFG Management", icon: Factory,
      children: [
        { label: "Overview", href: "/manufacturing" },
        ...mfgs.map(m => ({ label: m.name, href: `/manufacturing/${m.id}` })),
      ],
    },
    ...NAV.slice(2),
  ]

  const toggleSection = (label: string) =>
    setOpenSections(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )

  const toggleExpanded = (label: string) =>
    setExpandedSections(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )

  // A child matches if the pathname equals its href or is nested under it
  // (e.g. a detail page not represented as its own nav item). When several
  // children match — e.g. "/manufacturing" (Overview) is a prefix of
  // "/manufacturing/5" (a manufacturer's page) — only the most specific
  // (longest href) one should be highlighted, never both at once.
  const bestActiveChild = (children: NavChild[]): NavChild | undefined => {
    const matches = children.filter(c => pathname === c.href || pathname.startsWith(c.href + "/"))
    return matches.sort((a, b) => b.href.length - a.href.length)[0]
  }

  const isChildActive = (children: NavChild[], href: string) =>
    bestActiveChild(children)?.href === href

  const isSectionActive = (item: NavItem) =>
    item.href
      ? pathname === item.href
      : bestActiveChild(item.children ?? []) !== undefined

  const initials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U"

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-[width] duration-200 ease-in-out shrink-0 overflow-hidden",
          collapsed ? "w-14" : "w-56"
        )}
      >
        {/* Logo row */}
        <div className={cn(
          "flex items-center h-14 border-b border-sidebar-border shrink-0 px-3",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <span className="font-semibold text-sm text-sidebar-foreground truncate">ERP System</span>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors shrink-0"
          >
            {collapsed
              ? <ChevronRight className="h-4 w-4" />
              : <ChevronLeft className="h-4 w-4" />
            }
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {nav.map(item => {
            const active = isSectionActive(item)
            const hasChildren = (item.children?.length ?? 0) > 0
            const isOpen = openSections.includes(item.label)

            if (!hasChildren) {
              const navLink = (
                <Link
                  href={item.href ?? "#"}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-0"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              )
              return collapsed ? (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <div key={item.label}>{navLink}</div>
              )
            }

            const triggerBtn = (
              <button
                onClick={() => !collapsed && toggleSection(item.label)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-150", isOpen && "rotate-180")} />
                  </>
                )}
              </button>
            )

            return (
              <div key={item.label}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{triggerBtn}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  triggerBtn
                )}
                {!collapsed && isOpen && (() => {
                  const children = item.children!
                  const overflowCount = children.length - CHILD_CAP
                  const activeChild = bestActiveChild(children)
                  const activeIsHidden = !!activeChild && children.indexOf(activeChild) >= CHILD_CAP
                  const isExpanded = expandedSections.includes(item.label) || activeIsHidden
                  const visibleChildren = overflowCount > 0 && !isExpanded ? children.slice(0, CHILD_CAP) : children

                  return (
                    <div className="ml-6 mt-0.5 mb-1 space-y-0.5 border-l border-sidebar-border pl-3">
                      {visibleChildren.map(child => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "block px-2 py-1.5 rounded-md text-sm transition-colors",
                            isChildActive(children, child.href)
                              ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                          )}
                        >
                          {child.label}
                        </Link>
                      ))}
                      {overflowCount > 0 && (
                        <button
                          onClick={() => toggleExpanded(item.label)}
                          className="block w-full text-left px-2 py-1.5 rounded-md text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                        >
                          {isExpanded ? "Show less" : `Show more (${overflowCount})`}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </nav>

        {/* User row */}
        <div className={cn(
          "border-t border-sidebar-border p-3 flex items-center gap-2.5 shrink-0",
          collapsed ? "justify-center flex-col" : "justify-between"
        )}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-xs font-semibold shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name ?? "User"}</p>
                <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email ?? ""}</p>
              </div>
            )}
          </div>

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <form action={handleSignOut}>
                  <button
                    type="submit"
                    className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-destructive hover:bg-sidebar-accent transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </form>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <form action={handleSignOut}>
              <button
                type="submit"
                className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-destructive hover:bg-sidebar-accent transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
