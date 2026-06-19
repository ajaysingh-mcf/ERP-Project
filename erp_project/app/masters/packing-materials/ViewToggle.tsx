"use client"

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
          href={`/masters/packing-materials?view=${opt.key}`}
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
