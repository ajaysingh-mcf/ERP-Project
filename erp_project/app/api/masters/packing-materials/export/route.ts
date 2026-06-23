/**
 * GET /api/masters/packing-materials/export
 *
 * Exports packing material records for either the vendor or manufacturer rate
 * view. The `view` param mirrors the toggle on /masters/packing-materials so
 * the downloaded file always matches what the user is looking at.
 *
 * Query params (all optional):
 *   format — "csv" (default) | "xlsx"
 *   view   — "manufacturer" | anything else → vendor view (default)
 *   search — searches pm_code and name
 *   status — "active" | "discontinued | "inactive"
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
import { packingMaterials as pmSql } from "@/lib/queries/packing-materials"
import { buildCsv, buildXlsx } from "@/lib/export"
import { PM_VENDOR_EXPORT_COLUMNS, PM_MFG_EXPORT_COLUMNS } from "@/lib/export-configs"

const ROW_LIMIT = 50_000

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv"
  const isMfg  = sp.get("view") === "manufacturer"
  const search = sp.get("search") ?? ""
  const status = sp.get("status") ?? ""

  const like        = search ? `%${search}%` : null
  const statusParam = status || null

  // Params match selectVendorPaginated / selectMfgPaginated: [like×3, status×2]
  const filterParams = [like, like, like, statusParam, statusParam]

  const columns   = isMfg ? PM_MFG_EXPORT_COLUMNS : PM_VENDOR_EXPORT_COLUMNS
  const countSql  = isMfg ? pmSql.countMfg         : pmSql.countVendor
  const dataSql   = isMfg ? pmSql.selectMfgAllFiltered : pmSql.selectVendorAllFiltered
  const viewLabel = isMfg ? "manufacturer" : "vendor"
  const sheetName = isMfg ? "PM - Manufacturer Rates" : "PM - Vendor Rates"

  try {
    const [{ total }] = await query<{ total: number }>(countSql, filterParams)
    if (total > ROW_LIMIT) {
      return NextResponse.json(
        { error: `Export limited to ${ROW_LIMIT.toLocaleString()} rows. Query returned ${total.toLocaleString()}. Apply filters to narrow the result.` },
        { status: 413 }
      )
    }

    const rows = await query<Record<string, unknown>>(dataSql, filterParams)

    const date     = new Date().toISOString().split("T")[0]
    const filename = `packing_materials_${viewLabel}_${date}.${format}`

    if (format === "xlsx") {
      const buffer = await buildXlsx(sheetName, columns, rows)
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    const csv = buildCsv(columns, rows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error("[/api/masters/packing-materials/export]", err)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
