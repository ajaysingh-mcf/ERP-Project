"use client"

/**
 * CLIENT component for /masters/manufacturers.
 *
 * Receives a paginated slice of manufacturers from the server page.
 * Owns search (UrlSearchInput), Add/CSV dialogs, and the PaginationBar footer.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation"
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
import { DownloadButton } from "@/components/masters/DownloadButton"
import type { MasterField } from "@/components/masters/field-config"
import type { Mfg } from "@/types/masters"
import { useState } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EditMfgDialog } from "./EditMfgDialog"
const MFG_FIELDS: MasterField[] = [
  { key: "code",       label: "Code",       required: true,  placeholder: "e.g. MFG-001",         sample: "MFG-001" },
  { key: "name",       label: "Name",       required: true,  colSpan: 2, placeholder: "Manufacturer name", sample: "Acme Manufacturing" },
  { key: "location",   label: "Location",   placeholder: "e.g. Mumbai",           sample: "Mumbai" },
  { key: "gst_number", label: "GST Number", placeholder: "e.g. 27AAEPM1234C1Z5",  sample: "27AAEPM1234C1Z5" },
  { key: "status",     label: "Status",     placeholder: "e.g. active/inactive",  sample: "active" },
]

export default function ManufacturersClient({
  rows,
  total,
  page,
  pageSize,
  currentSearch,
}: {
  rows: Mfg[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
}) {
  const router = useRouter()
  // router.refresh() re-runs the server page with current URL — keeps page + filters.
  const refresh = () => router.refresh()
  const [editMfg, setEditMfg] = useState<Mfg | null>(null)
  return (
    <>
      {/* ── Toolbar ── */}
      <MasterToolbar>
        <UrlSearchInput
          initialValue={currentSearch}
          placeholder="Search by code or name…"
        />
        <MasterToolbarActions>
          <DownloadButton
            endpoint="/api/masters/manufacturers/export"
            label="Manufacturers"
          />
          <CsvImportDialog
            entityLabel="Manufacturer"
            endpoint="/api/masters/manufacturers"
            templateFilename="manufacturer_template.csv"
            fields={MFG_FIELDS}
            onSuccess={refresh}
          />
          <AddRecordDialog
            entityLabel="Manufacturer"
            endpoint="/api/masters/manufacturers"
            fields={MFG_FIELDS}
            onSuccess={refresh}
          />
        </MasterToolbarActions>
      </MasterToolbar>

      {/* ── Table card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {total} record{total !== 1 ? "s" : ""}
            {currentSearch && (
              // UrlSearchInput handles clearing ?search= via the debounce, but we expose
              // a quick-clear button so the user doesn't have to empty the text box manually.
              <span className="ml-2 text-xs text-muted-foreground">
                matching &ldquo;{currentSearch}&rdquo;
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" >Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    {currentSearch
                      ? "No manufacturers match your search."
                      : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.mfg_id}>
                    <TableCell className="font-mono text-xs font-medium">{row.code}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.location}</TableCell>
                    <TableCell>{row.gst_number}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => setEditMfg(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <PaginationBar total={total} page={page} pageSize={pageSize} />
        </CardContent>
      </Card>
      <EditMfgDialog
        mfg={editMfg}
        onSuccess={refresh}
        onClose={() => setEditMfg(null)}
      />
    </>
  )
}
