"use client"

// Segmented toggle that switches the Raw Materials view via the URL `?view=`
// param. Because it navigates (rather than flipping client state), the SERVER
// page re-runs and queries ONLY the selected rate master — the manufacturer
// data is never fetched unless the user actually opens that view.
import Link from "next/link"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { key: "vendor", label: "By Vendor" },
  { key: "manufacturer", label: "By Manufacturer" },
] as const

export function ViewToggle({ active }: { active: "vendor" | "manufacturer" }) {
  return (
    <div className="mb-4 inline-flex rounded-lg border border-input p-0.5">
      {OPTIONS.map((opt) => (
        <Link
          key={opt.key}
          href={`/masters/raw-materials?view=${opt.key}`}
          // scroll={false} keeps the page position when toggling.
          scroll={false}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === opt.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  )
}
