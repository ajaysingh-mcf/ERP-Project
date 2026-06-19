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
import type { Sku } from "@/types/masters"

// CLIENT component for /masters/skus. Receives the SKU rows from the server
// page (SkusPage) as `initialSkus` and owns all interactivity: search, status
// filter, and the Add / CSV-import dialogs. The dialogs POST to
// /api/masters/skus and call router.refresh() on success to re-fetch the page.

// Single source of truth for the SKU Add form + CSV importer.
const SKU_FIELDS: MasterField[] = [
  {
    key: "sku_code",
    label: "SKU Code",
    required: true,
    aliases: ["code"],
    placeholder: "e.g. SKU-001",
    sample: "SKU-001",
  },
  {
    key: "name",
    label: "Name",
    required: true,
    placeholder: "Product Name",
    sample: "Product Alpha",
  },
  { key: "brand", label: "Brand", placeholder: "Brand", sample: "Brand A" },
  {
    key: "category",
    label: "Category",
    placeholder: "Category",
    sample: "Category 1",
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    default: "active",
    colSpan: 2,
    sample: "active",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
]

export default function SkusClient({ initialSkus }: { initialSkus: Sku[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = initialSkus.filter((s) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      s.sku_code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.brand ?? "").toLowerCase().includes(q) ||
      (s.category ?? "").toLowerCase().includes(q)
    const matchStatus = statusFilter === "all" || s.status === statusFilter
    return matchSearch && matchStatus
  })

  const hasFilters = search || statusFilter !== "all"
  const refresh = () => router.refresh()

  return (
    <>
      <MasterToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code, name, brand…"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="mCaffeine">mCaffeine</option>
          <option value="Hyphen">Hyphen</option>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {filtered.length} of {initialSkus.length} records
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("")
                  setStatusFilter("all")
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
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-10"
                  >
                    {hasFilters
                      ? "No SKUs match your filters."
                      : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {row.sku_code}
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.brand ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.category ?? "—"}
                    </TableCell>
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
        </CardContent>
      </Card>
    </>
  )
}
