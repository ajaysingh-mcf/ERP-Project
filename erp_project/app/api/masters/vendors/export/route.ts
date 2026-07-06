/**
 * GET /api/masters/vendors/export
 *
 * Exports all vendor records matching the current active filters as CSV or Excel.
 *
 * Query params (all optional):
 *   format — "csv" (default) | "xlsx"
 *   search — searches vendor code and name
 *   type   — "rm" | "pm" | "both"
 *   zone   — exact zone match
 *
 * Responses:
 *   200  — file attachment
 *   401  — unauthenticated
 *   413  — result set exceeds ROW_LIMIT
 *   500  — server error
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { vendors as vendorSql } from "@/lib/queries/vendors"
import { buildCsv, buildXlsx, buildExportFilename } from "@/lib/export"
import { VENDOR_EXPORT_COLUMNS } from "@/lib/export-configs"

const ROW_LIMIT = 50_000

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv"
  const search = sp.get("search") ?? ""
  const type   = sp.get("type")   ?? ""
  const zone   = sp.get("zone")   ?? ""

  const filterParams = vendorSql.filterParams(search || null, type || null, zone || null)

  try {
    const [{ total }] = await query<{ total: number }>(
      vendorSql.countAll,
      filterParams
    )
    if (total > ROW_LIMIT) {
      return NextResponse.json(
        { error: `Export limited to ${ROW_LIMIT.toLocaleString()} rows. Query returned ${total.toLocaleString()}. Apply filters to narrow the result.` },
        { status: 413 }
      )
    }

    const rows = await query<Record<string, unknown>>(
      vendorSql.selectAllFiltered,
      filterParams
    )

    const filename = buildExportFilename("vendors", format, { type: type || null, zone: zone || null, search: search || null })
    console.log(`[/api/masters/vendors/export] served ${rows.length} rows as ${format}`)

    if (format === "xlsx") {
      const buffer = await buildXlsx("Vendors", VENDOR_EXPORT_COLUMNS, rows)
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    const csv = buildCsv(VENDOR_EXPORT_COLUMNS, rows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error("[/api/masters/vendors/export]", err)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
