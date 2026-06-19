"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import type { Mfg } from "@/types/masters"

// CLIENT component for /masters/manufacturers. Receives manufacturer rows from
// the server page as `initialRows` and owns search + the Add / CSV-import
// dialogs, which POST to /api/masters/manufacturers.

const MFG_FIELDS: MasterField[] = [
  {
    key: "code",
    label: "Code",
    required: true,
    placeholder: "e.g. MFG-001",
    sample: "MFG-001",
  },
  {
    key: "name",
    label: "Name",
    required: true,
    colSpan: 2,
    placeholder: "Manufacturer name",
    sample: "Acme Manufacturing",
  },
  {
    key: "location",
    label: "Location",
    placeholder: "e.g. Mumbai",
    sample: "Mumbai",
  },
  {
    key: "gst_number",
    label: "GST Number",
    placeholder: "e.g. 27AAEPM1234C1Z5",
    sample: "27AAEPM1234C1Z5",
  },  
  {
    key: "status",
    label: "Status",
    placeholder: "e.g. active/inactive",
    sample: "active",
  },
]

export default function ManufacturersClient({
  initialRows,
}: {
  initialRows: Mfg[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")

  const filtered = initialRows.filter((r) => {
    const q = search.toLowerCase()
    return (
      !q ||
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q)
    )
  })

  const refresh = () => router.refresh()

  return (
    <>
      <MasterToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code or name…"
        />
        <MasterToolbarActions>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {filtered.length} of {initialRows.length} records
            {search && (
              <button
                onClick={() => setSearch("")}
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
                <TableHead>Location</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-10"
                  >
                    {search ? "No manufacturers match your search." : "No records found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.mfg_id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {row.code}
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-medium">{row.location}</TableCell>
                    <TableCell className="font-medium">{row.gst_number}</TableCell>
                    <TableCell className="font-medium">{row.status}</TableCell>
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
