"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

const MATERIALS = [
  { key: "rm", label: "Raw Material" },
  { key: "pm", label: "Packing Material" },
] as const

export function MaterialToggle({ material }: { material: "rm" | "pm" }) {
  return (
    <div className="inline-flex rounded-lg border border-input p-0.5 mb-4">
      {MATERIALS.map((opt) => (
        <Link
          key={opt.key}
          href={`/masters/material-master?material=${opt.key}`}
          scroll={false}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            material === opt.key
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
