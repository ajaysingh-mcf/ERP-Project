"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
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
import { cn } from "@/lib/utils"

export type AnyRow = Record<string, unknown>
export type ColumnDef = {
  key: string
  label: string
  sortAs: "text" | "num" | "date"
  className?: string
  render?: (row: AnyRow) => ReactNode
}

export const fmtDate = (v: unknown) =>
  v ? new Date(v as string).toLocaleDateString("en-CA") : "—"

export const statusBadge = (row: AnyRow) => (
  <Badge
    variant={row.status === "active" ? "success" : "secondary"}
    className="capitalize"
  >
    {(row.status as string) ?? "—"}
  </Badge>
)

const PM_FIELDS: MasterField[] = [
  { key: "pm_code", label: "PM Code", aliases: ["code"], placeholder: "e.g. PM-001", sample: "PM-001" },
  { key: "name", label: "Name", required: true, placeholder: "Material name", sample: "Label 100ml" },
  { key: "type", label: "Type", placeholder: "e.g. Label / Carton", sample: "Label" },
  { key: "hsn_code", label: "HSN Code", placeholder: "e.g. 48191000", sample: "48191000" },
  { key: "uom", label: "UOM", placeholder: "e.g. pcs", sample: "pcs" },
  {
    key: "status", label: "Status", type: "select", default: "active", colSpan: 2, sample: "active",
    options: [
      { value: "active", label: "Active" },
      { value: "discontinued", label: "Discontinued" },
    ],
  },
]

export function PmRateTable({
  rows,
  columns,
  actionColumn,
  addFormFields,
}: {
  rows: AnyRow[]
  columns: ColumnDef[]
  actionColumn?: (row: AnyRow) => ReactNode
  /** Override fields shown in the Add dialog (CSV template always uses base PM_FIELDS). */
  addFormFields?: MasterField[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      String(r.pm_code ?? "").toLowerCase().includes(q) ||
      String(r.name ?? "").toLowerCase().includes(q) ||
      String(r.type ?? "").toLowerCase().includes(q)
    const matchStatus = statusFilter === "all" || r.status === statusFilter
    return matchSearch && matchStatus
  })

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const col = columns.find((c) => c.key === sortKey)
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const aEmpty = av === null || av === undefined || av === ""
      const bEmpty = bv === null || bv === undefined || bv === ""
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      let cmp = 0
      if (col?.sortAs === "num") {
        cmp = Number(av) - Number(bv)
      } else if (col?.sortAs === "date") {
        cmp = new Date(av as string).getTime() - new Date(bv as string).getTime()
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      }
      return cmp * dir
    })
  }, [filtered, columns, sortKey, sortDir])

  const hasFilters = search || statusFilter !== "all"
  const refresh = () => router.refresh()

  return (
    <>
      <MasterToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code, name, type…"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="discontinued">Discontinued</option>
        </select>

        <MasterToolbarActions>
          <CsvImportDialog
            entityLabel="Packing Material"
            entityLabelPlural="Packing Materials"
            endpoint="/api/masters/packing-materials"
            templateFilename="packing_material_template.csv"
            fields={PM_FIELDS}
            onSuccess={refresh}
          />
          <AddRecordDialog
            entityLabel="Packing Material"
            endpoint="/api/masters/packing-materials"
            fields={addFormFields ?? PM_FIELDS}
            onSuccess={refresh}
          />
        </MasterToolbarActions>
      </MasterToolbar>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {filtered.length} of {rows.length} records
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
          <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
            <TableHeader>
              <TableRow>
                {columns.map((col) => {
                  const active = sortKey === col.key
                  return (
                    <TableHead key={col.key} className="bg-gray-200 font-medium text-muted-foreground">
                      <button
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                      >
                        {col.label}
                        {active ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                  )
                })}
                {actionColumn && <TableHead className="bg-gray-200 w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center text-muted-foreground py-10"
                  >
                    {hasFilters
                      ? "No packing materials match your filters."
                      : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row, index) => (
                  <TableRow
                    key={index}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-200"}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={col.className ?? "text-muted-foreground"}
                      >
                        {col.render
                          ? col.render(row)
                          : ((row[col.key] as ReactNode) ?? "—")}
                      </TableCell>
                    ))}
                    {actionColumn && (
                      <TableCell>{actionColumn(row)}</TableCell>
                    )}
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
