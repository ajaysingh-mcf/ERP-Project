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
import { cn } from "@/lib/utils"
import AddMaterialDialog from "./AddMaterialDialog"

type AnyRow = Record<string, unknown>
type ColumnDef = {
  key: string
  label: string
  sortAs: "text" | "num"
  className?: string
  render?: (row: AnyRow) => ReactNode
}

const statusBadge = (row: AnyRow) => (
  <Badge
    variant={row.status === "active" ? "success" : "secondary"}
    className="capitalize"
  >
    {(row.status as string) ?? "—"}
  </Badge>
)

const RM_COLUMNS: ColumnDef[] = [
  { key: "rm_code",   label: "RM Code",   sortAs: "text", className: "font-mono text-xs font-medium" },
  { key: "name",      label: "Name",      sortAs: "text", className: "font-medium" },
  { key: "make",      label: "Make",      sortAs: "text" },
  { key: "type",      label: "Type",      sortAs: "text" },
  { key: "uom",       label: "UOM",       sortAs: "text", className: "uppercase text-xs text-muted-foreground" },
  { key: "hsn_code",  label: "HSN Code",  sortAs: "text" },
  { key: "inci_name", label: "INCI Name", sortAs: "text" },
  { key: "status",    label: "Status",    sortAs: "text", render: statusBadge },
]

const PM_COLUMNS: ColumnDef[] = [
  { key: "pm_code",  label: "PM Code",  sortAs: "text", className: "font-mono text-xs font-medium" },
  { key: "name",     label: "Name",     sortAs: "text", className: "font-medium" },
  { key: "type",     label: "Type",     sortAs: "text" },
  { key: "uom",      label: "UOM",      sortAs: "text", className: "uppercase text-xs text-muted-foreground" },
  { key: "hsn_code", label: "HSN Code", sortAs: "text" },
  { key: "status",   label: "Status",   sortAs: "text", render: statusBadge },
]

export default function MaterialMasterClient({
  material,
  rows,
}: {
  material: "rm" | "pm"
  rows: AnyRow[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const columns = material === "rm" ? RM_COLUMNS : PM_COLUMNS
  const codeKey = material === "rm" ? "rm_code" : "pm_code"

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
      String(r[codeKey] ?? "").toLowerCase().includes(q) ||
      String(r.name ?? "").toLowerCase().includes(q) ||
      String(r.type ?? "").toLowerCase().includes(q) ||
      (material === "rm" ? String(r.make ?? "").toLowerCase().includes(q) : false)
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
      const cmp =
        col?.sortAs === "num"
          ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv), undefined, { numeric: true })
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
          placeholder={
            material === "rm"
              ? "Search by code, name, make, type…"
              : "Search by code, name, type…"
          }
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
          {/* Simple dialog — adds base material only, no vendor/mfg rate steps */}
          <AddMaterialDialog material={material} onSuccess={refresh} />
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
                    <TableHead
                      key={col.key}
                      className="bg-gray-200 font-medium text-muted-foreground"
                    >
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
                      ? "No materials match your filters."
                      : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row, index) => (
                  <TableRow
                    key={index}
                    className={cn(
                      index % 2 === 0 ? "bg-white" : "bg-gray-200"
                    )}
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
