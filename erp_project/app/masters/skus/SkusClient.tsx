"use client"

/**
 * CLIENT component for /masters/skus.
 *
 * Receives a paginated slice of SKUs from the server page (SkusPage).
 * Owns all interactive behaviour: URL-synced search, status filter, Add/CSV
 * dialogs, and the PaginationBar footer.
 *
 * Filter changes push new URL params (resetting to page 1); the server
 * re-renders with the DB-filtered slice. router.refresh() after Add/CSV keeps
 * the user on their current page with their current filters.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { useMemo , useState } from "react"
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
import { CsvImportDialog } from "@/components/masters/CsvImportDialog"
import { AddRecordDialog } from "@/components/masters/AddRecordDialog"
import type { MasterField } from "@/components/masters/field-config"
import type { Sku } from "@/types/masters"

const SKU_FIELDS: MasterField[] = [
  { key: "sku_code",  label: "SKU Code",  required: true,  aliases: ["code"], placeholder: "e.g. SKU-001", sample: "SKU-001" },
  { key: "name",      label: "Name",      required: true,  placeholder: "Product Name",  sample: "Product Alpha" },
  { key: "brand",     label: "Brand",     placeholder: "Brand",    sample: "Brand A" },
  { key: "category",  label: "Category",  placeholder: "Category", sample: "Category 1" },
  {
    key: "status", label: "Status", type: "select", default: "active", colSpan: 2, sample: "active",
    options: [
      { value: "active",   label: "Active"   },
      { value: "inactive", label: "Inactive" },
    ],
  },
]

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
  const hasFilters = !!currentSearch || !!currentStatus ||  brandFilter !== "all";
  const refresh    = () => router.refresh()
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
          value={currentStatus || "all"}
          onChange={(e) =>
            navigate({ status: e.target.value === "all" ? "" : e.target.value })
          }
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="discontinued"> Discontinued</option>
        </select>
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
          <CsvImportDialog
            entityLabel="SKU"
            endpoint="/api/masters/skus"
            templateFilename="sku_template.csv"
            fields={SKU_FIELDS}
            onSuccess={refresh}
          />
          <AddRecordDialog
            entityLabel="SKU"
            endpoint="/api/masters/skus"
            fields={SKU_FIELDS}
            onSuccess={refresh}
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
                onClick={() => navigate({ search: "", status: "" , brand:""})}
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
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.brand ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.category ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === "active" ? "success" : "secondary"}
                        className="capitalize"
                      >
                        {row.status ?? "—"}
                      </Badge>
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
