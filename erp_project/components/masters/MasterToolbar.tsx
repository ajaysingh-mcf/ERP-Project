import * as React from "react"
import { cn } from "@/lib/utils"

/** Layout row for a master page: search + filters on the left, actions on the right. */
export function MasterToolbar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row gap-3 mb-5", className)}>
      {children}
    </div>
  )
}

/** Right-aligned action cluster (e.g. Upload CSV + Add buttons). */
export function MasterToolbarActions({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("flex gap-2 sm:ml-auto", className)}>{children}</div>
}
