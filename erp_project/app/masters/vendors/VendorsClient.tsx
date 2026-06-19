"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { SearchInput } from "@/components/masters/SearchInput"
import {
  MasterToolbar,
  MasterToolbarActions,
} from "@/components/masters/MasterToolbar"
import { CsvImportDialog } from "@/components/masters/CsvImportDialog"
import { AddRecordDialog } from "@/components/masters/AddRecordDialog"
import type { MasterField } from "@/components/masters/field-config"
import type { Vendor } from "@/types/masters"

// CLIENT component for /masters/vendors. Receives vendor rows from the server
// page as `initialRows` and owns search + a type filter + the Add / CSV-import
// dialogs, which POST to /api/masters/vendors.

const VENDOR_FIELDS: MasterField[] = [
  {
    key: "code",
    label: "Code",
    required: true,
    placeholder: "e.g. VEN-001",
    sample: "VEN-001",
  },
  {
    key: "name",
    label: "Name",
    required: true,
    placeholder: "Vendor name",
    sample: "Acme Pvt Ltd",
  },
  {
    key: "type",
    label: "Type",
    type: "select",
    required: true,
    default: "rm",
    colSpan: 2,
    sample: "rm",
    options: [
      { value: "rm", label: "RM" },
      { value: "pm", label: "PM" },
      { value: "both", label: "Both" },
    ],
  },
  {
    key: "location",
    label: "Location",
    required: true,
  },
  {
    key: "gst_number",
    label: "GST Number",
    required: true,
  },
  {
    key: "status",
    label: "Status",
    required: false,
    type: "select",
    default: "active",
    colSpan: 2,
    sample: "active",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  }

]

export default function VendorsClient({
  initialRows,
}: {
  initialRows: Vendor[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")

  const filtered = initialRows.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q)
    const matchType = typeFilter === "all" || r.type === typeFilter
    return matchSearch && matchType
  })

  const hasFilters = search || typeFilter !== "all"
  const refresh = () => router.refresh()

  return (
    <>
      <MasterToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code or name…"
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Types</option>
          <option value="rm">RM</option>
          <option value="pm">PM</option>
          <option value="both">Both</option>
          <option value="location">Location</option>
          <option value="gst_number">GST Number</option>
        </select>

        <MasterToolbarActions>
          <CsvImportDialog
            entityLabel="Vendor"
            endpoint="/api/masters/vendors"
            templateFilename="vendor_template.csv"
            fields={VENDOR_FIELDS}
            onSuccess={refresh}
          />
          <AddRecordDialog
            entityLabel="Vendor"
            endpoint="/api/masters/vendors"
            fields={VENDOR_FIELDS}
            onSuccess={refresh}
          />
        </MasterToolbarActions>
      </MasterToolbar>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {filtered.length} of {initialRows.length} records
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("")
                  setTypeFilter("all")
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
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground py-10"
                  >
                    {hasFilters
                      ? "No vendors match your filters."
                      : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.vendor_id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {row.code}
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.location ?? "—"}</TableCell>
                    <TableCell>{row.gst_number ?? "—"}</TableCell>
                    <TableCell>{row.status ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
