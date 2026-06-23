"use client"

/**
 * DownloadButton
 *
 * A pair of split action buttons for downloading master table data as CSV or
 * Excel. Reads current URL search params so the exported file always reflects
 * the user's active filters (search, status, view, etc.) — not just the
 * current page.
 *
 * Download mechanism: sets window.location.href instead of using fetch().
 * This lets the browser handle the file download natively and ensures the
 * session cookie is forwarded for authentication — no Blob/FileReader needed.
 *
 * Usage:
 *   <DownloadButton
 *     endpoint="/api/masters/skus/export"
 *     label="SKUs"
 *   />
 */

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

type DownloadButtonProps = {
  /** Export API route, e.g. "/api/masters/skus/export" */
  endpoint: string
  /** Entity label shown in button titles, e.g. "SKUs" */
  label: string
  disabled?: boolean
}

export function DownloadButton({ endpoint, label, disabled }: DownloadButtonProps) {
  const searchParams          = useSearchParams()
  const [loading, setLoading] = useState<"csv" | "xlsx" | null>(null)

  function download(format: "csv" | "xlsx") {
    if (loading || disabled) return
    setLoading(format)

    // Clone current URL params and strip pagination — export returns all rows.
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("size")
    params.set("format", format)

    // window.location.href triggers a native browser download without navigating
    // away, and automatically includes session cookies for auth.
    window.location.href = `${endpoint}?${params.toString()}`

    // We can't detect when the download finishes, so reset state after a delay.
    setTimeout(() => setLoading(null), 2500)
  }

  return (
    <div className="flex items-center gap-1" title={`Download ${label}`}>
      <Button
        size="sm"
        variant="outline"
        disabled={!!loading || disabled}
        onClick={() => download("csv")}
        className="h-8 gap-1.5 text-xs bg-blue-100 "
        title={`Download ${label} as CSV`}
      >
        <Download className="h-3.5 w-3.5" />
        {loading === "csv" ? "…" : "CSV"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!!loading || disabled}
        onClick={() => download("xlsx")}
        className="h-8 gap-1.5 text-xs bg-blue-100 "
        title={`Download ${label} as Excel`}
      >
        <Download className="h-3.5 w-3.5" />
        {loading === "xlsx" ? "…" : "Excel"}
      </Button>
    </div>
  )
}
