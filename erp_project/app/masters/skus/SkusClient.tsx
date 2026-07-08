"use client"

/**
 * CLIENT component for /masters/skus.
 *
 * Receives a paginated slice of SKUs from the server page (SkusPage).
 * Owns all interactive behaviour: URL-synced search, status filter, edit
 * dialog, and the PaginationBar footer.
 *
 * Filter changes push new URL params (resetting to page 1); the server
 * re-renders with the DB-filtered slice.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { useEffect, useMemo , useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UrlSearchInput } from "@/components/masters/UrlSearchInput"
import { PaginationBar } from "@/components/ui/pagination-bar"
import {
  MasterToolbar,
  MasterToolbarActions,
} from "@/components/masters/MasterToolbar"
import { DownloadButton } from "@/components/masters/DownloadButton"
import type { Sku } from "@/types/masters"

export default function SkusClient({
  rows,
  total,
  page,
  pageSize,
  currentSearch,
  currentStatus,
}: {
  rows: Sku[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentStatus: string
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  /** Merge URL-param overrides and reset to page 1. */
  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else   params.delete(k)
    }
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }
  const [brandFilter, setBrandFilter] = useState("all");
  // Draft status — the select only updates this locally; the actual server
  // refetch fires only when "Apply" is clicked. Brand filtering happens
  // entirely client-side already, so it stays instant.
  const [draftStatus, setDraftStatus] = useState(currentStatus)
  useEffect(() => setDraftStatus(currentStatus), [currentStatus])
  const draftDirty = draftStatus !== currentStatus
  const hasFilters = !!currentSearch || !!currentStatus || brandFilter !== "all";
  const filteredRows = useMemo(() => {
  if (brandFilter === "all") return rows

  return rows.filter(
    (row) =>
      row.brand?.toLowerCase() === brandFilter.toLowerCase()
  )
}, [rows, brandFilter])
  return (
    <>
      {/* ── Toolbar ── */}
      <MasterToolbar>
        <UrlSearchInput
          initialValue={currentSearch}
          placeholder="Search by code, name, brand…"
        />
        {/* Search Based on Status. */}
        <select
          value={draftStatus || "all"}
          onChange={(e) =>
            setDraftStatus(e.target.value === "all" ? "" : e.target.value)
          }
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="discontinued"> Discontinued</option>
        </select>
        <button
          onClick={() => navigate({ status: draftStatus })}
          disabled={!draftDirty}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply
        </button>
          {/* Search Based on Brands. */}
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Brands</option>
          <option value="mCaffeine">mCaffeine</option>
          <option value="hyphen">Hyphen</option>
        </select>


        <MasterToolbarActions>
          <DownloadButton
            endpoint="/api/masters/skus/export"
            label="SKUs"
          />
        </MasterToolbarActions>
      </MasterToolbar>

      {/* ── Table card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {total} record{total !== 1 ? "s" : ""}
            {hasFilters && (
              <button
                onClick={() => {
                  setDraftStatus("")
                  setBrandFilter("all")
                  navigate({ search: "", status: "" , brand:""})
                }}
                className="ml-2 text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Created By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    {hasFilters ? "No SKUs match your filters." : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs font-medium">{row.sku_code}</TableCell>
                    <TableCell className="font-medium text-wrap">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.brand ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.category ?? "—"}</TableCell>
                    <TableCell>
                      {row.status === "in_review" ? (
                        <Badge variant="warning" className="capitalize">In Review</Badge>
                      ) : row.status === "draft" ? (
                        <Badge variant="secondary" className="capitalize">Draft</Badge>
                      ) : (
                        <Badge
                          variant={row.status === "active" ? "success" : "secondary"}
                          className="capitalize"
                        >
                          {row.status ?? "—"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString("en-IN")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.created_by ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <PaginationBar total={total} page={page} pageSize={pageSize} />
        </CardContent>
      </Card>
    </>
  )
}
