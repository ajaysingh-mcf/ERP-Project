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
import type { BOM } from "@/types/masters"

const BOM_FIELDS: MasterField[] = [
  {
    key: "bom_code",
    label: "BOM Code",
    required: true,
    placeholder: "e.g. BOM-001",
    sample: "BOM-001",
    colSpan: 2,
  },
  {
    key: "sku_code",
    label: "SKU Code",
    required: true,
    placeholder: "e.g. SKU-001",
    sample: "SKU-001",
    colSpan: 2,
  },
  {
    key: "mfg_id",
    label: "Manufacturer ID",
    type: "number",
    required: true,
    placeholder: "e.g. 1",
    sample: "1",
  },
  {
    key: "status",
    label: "BOM Status",
    type: "select",
    required: false,
    default: "draft",
    sample: "draft",
    options: [
      { value: "draft", label: "Draft" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
  {
    key: "mtrl_type",
    label: "Material Type",
    type: "select",
    required: true,
    default: "rm",
    sample: "rm",
    options: [
      { value: "rm", label: "RM" },
      { value: "pm", label: "PM" },
    ],
  },
  {
    key: "mtrl_id",
    label: "Material ID",
    type: "number",
    required: true,
    placeholder: "e.g. 10",
    sample: "10",
  },
  {
    key: "amount",
    label: "Amount",
    type: "number",
    required: true,
    placeholder: "e.g. 0.5",
    sample: "0.5",
  },
  {
    key: "uom",
    label: "UOM",
    required: false,
    placeholder: "e.g. kg",
    sample: "kg",
  },
  {
    key: "mtrl_cost",
    label: "Material Cost",
    type: "number",
    required: false,
    placeholder: "e.g. 120.00",
    sample: "120.00",
  },
  {
    key: "effective_from",
    label: "Effective From",
    required: false,
    placeholder: "YYYY-MM-DD",
    sample: "2025-01-01",
  },
  {
    key: "effective_till",
    label: "Effective Till",
    required: false,
    placeholder: "YYYY-MM-DD",
    sample: "2025-12-31",
  },
]

function formatDate(val: Date | string | null) {
  if (!val) return "—"
  const d = typeof val === "string" ? new Date(val) : val
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export default function BOMMasterComponent({ initialRows }: { initialRows: BOM[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = initialRows.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      (r.bom_code ?? "").toLowerCase().includes(q) ||
      (r.sku_code ?? "").toLowerCase().includes(q)
    const matchType = typeFilter === "all" || r.mtrl_type === typeFilter
    const matchStatus = statusFilter === "all" || r.bom_status === statusFilter
    return matchSearch && matchType && matchStatus
  })

  const hasFilters = search || typeFilter !== "all" || statusFilter !== "all"
  const refresh = () => router.refresh()

  return (
    <>
      <MasterToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by BOM code or SKU code…"
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Types</option>
          <option value="rm">RM</option>
          <option value="pm">PM</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="in review">In Review</option>
          <option value="discontinued">Discontinued</option>
        </select>

        <MasterToolbarActions>
          <CsvImportDialog
            entityLabel="BOM"
            entityLabelPlural="BOM entries"
            endpoint="/api/masters/bom-master"
            templateFilename="bom_template.csv"
            fields={BOM_FIELDS}
            onSuccess={refresh}
          />
          <AddRecordDialog
            entityLabel="BOM"
            endpoint="/api/masters/bom-master"
            fields={BOM_FIELDS}
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
                <TableHead>BOM Code</TableHead>
                <TableHead>SKU Code</TableHead>
                <TableHead>Material ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Effective Till</TableHead>
                <TableHead>BOM Status</TableHead>
                <TableHead>Material Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center text-muted-foreground py-10"
                  >
                    {hasFilters ? "No BOM records match your filters." : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row, i) => (
                  <TableRow key={`${row.bom_id}-${row.mtrl_id}-${i}`}>
                    <TableCell className="font-mono text-xs font-medium">
                      {row.bom_code ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.sku_code ?? "—"}
                    </TableCell>
                    <TableCell>{row.mtrl_id ?? "—"}</TableCell>
                    <TableCell>
                      {row.mtrl_type ? (
                        <Badge variant="outline" className="uppercase text-xs">
                          {row.mtrl_type}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{row.uom ?? "—"}</TableCell>
                    <TableCell>{row.amount ?? "—"}</TableCell>
                    <TableCell>{row.mtrl_cost != null ? `₹${row.mtrl_cost}` : "—"}</TableCell>
                    <TableCell className="text-sm">{formatDate(row.effective_from)}</TableCell>
                    <TableCell className="text-sm">{formatDate(row.effective_till)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.bom_status === "active" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {row.bom_status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.material_status === "active" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {row.material_status ?? "—"}
                      </Badge>
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
