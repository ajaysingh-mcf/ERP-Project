"use client"

/**
 * CLIENT component for /masters/vendors.
 *
 * Receives a pre-filtered, pre-paginated slice of vendors from the server page.
 * Owns all interactive behaviour:
 *   - URL-synced search (UrlSearchInput — 350 ms debounce → ?search=)
 *   - Type filter (select → ?type=)
 *   - Add record dialog (POST /api/masters/vendors)
 *   - CSV import dialog  (POST /api/masters/vendors)
 *   - Pagination footer  (PaginationBar — navigates ?page= / ?size=)
 *
 * Navigation strategy: every filter/page change is merged into the current URL
 * via the local `navigate()` helper, which calls router.push(). This keeps all
 * active params (?search=, ?type=, ?page=, ?size=) consistent in the URL.
 *
 * After an Add or CSV import, router.refresh() re-runs the server page with
 * the SAME URL params so the user stays on their current page and filters.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
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
import { DownloadButton } from "@/components/masters/DownloadButton"
import type { MasterField } from "@/components/masters/field-config"
import type { Vendor } from "@/types/masters"
import { useState } from "react"
import { FileText, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EditVendorDialog } from "./EditVendorDialog"
import { AddVendorDialog } from "./AddVendorDialog"
import { VendorDocumentsDialog } from "./VendorDocumentsDialog"
// Common fields shared by the CSV importer.
const VENDOR_CSV_FIELDS: MasterField[] = [
  { key: "name",            label: "Name",            required: true, placeholder: "Vendor name",      sample: "Acme Pvt Ltd" },
  {
    key: "type", label: "Type", type: "select", required: true, default: "rm", colSpan: 2, sample: "rm",
    options: [
      { value: "rm",   label: "RM"   },
      { value: "pm",   label: "PM"   },
      { value: "both", label: "Both" },
    ],
  },
  { key: "registered_name", label: "Registered Name", placeholder: "Legal registered name", sample: "Acme Pvt Ltd" },
  { key: "location",        label: "Location",        placeholder: "e.g. Mumbai",           sample: "Mumbai" },
  { key: "zone",            label: "Zone",            placeholder: "e.g. West",             sample: "West" },
]

export default function VendorsClient({
  rows,
  total,
  page,
  pageSize,
  currentSearch,
  currentType,
}: {
  rows: Vendor[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentType: string
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [docsVendor, setDocsVendor] = useState<Vendor | null>(null)
  /**
   * Merge one or more key/value overrides into the current URL params,
   * reset page to 1, then navigate. Empty-string values delete the param.
   */
  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else   params.delete(k)
    }
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  const hasFilters = currentSearch || currentType
  // router.refresh() re-runs the server page with the SAME URL, keeping page + filters.
  const refresh    = () => router.refresh()

  return (
    <>
      {/* ── Toolbar ── */}
      <MasterToolbar>
        <UrlSearchInput
          initialValue={currentSearch}
          placeholder="Search by code or name…"
        />

        <select
          value={currentType || "all"}
          onChange={(e) =>
            navigate({ type: e.target.value === "all" ? "" : e.target.value })
          }
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Types</option>
          <option value="rm">RM</option>
          <option value="pm">PM</option>
          <option value="both">Both</option>
        </select>

        <MasterToolbarActions>
          <DownloadButton
            endpoint="/api/masters/vendors/export"
            label="Vendors"
          />
          <CsvImportDialog
            entityLabel="Vendor"
            endpoint="/api/masters/vendors"
            templateFilename="vendor_template.csv"
            fields={VENDOR_CSV_FIELDS}
            onSuccess={refresh}
          />
          <AddVendorDialog onSuccess={refresh} />
        </MasterToolbarActions>
      </MasterToolbar>

      {/* ── Table card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {total} record{total !== 1 ? "s" : ""}
            {hasFilters && (
              <button
                onClick={() => navigate({ search: "", type: "" })}
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
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Registered Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    {hasFilters ? "No vendors match your filters." : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.vendor_id}>
                    <TableCell className="font-mono text-xs font-medium">{row.code}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.registered_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{row.type}</Badge>
                    </TableCell>
                    <TableCell>{row.location ?? "—"}</TableCell>
                    <TableCell>{row.zone ?? "—"}</TableCell>
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
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditVendor(row)}
                          disabled={row.status === "in_review"}
                          title={row.status === "in_review" ? "Pending approval — cannot edit" : "Edit"}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDocsVendor(row)}
                          title="Documents"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination footer: rows-per-page selector + prev/next */}
          <PaginationBar total={total} page={page} pageSize={pageSize} />
        </CardContent>
      </Card>
      <EditVendorDialog
        vendor={editVendor}
        onSuccess={refresh}
        onClose={() => setEditVendor(null)}
      />
      <VendorDocumentsDialog
        vendor={docsVendor}
        onSuccess={refresh}
        onClose={() => setDocsVendor(null)}
      />
    </>
  )
}
