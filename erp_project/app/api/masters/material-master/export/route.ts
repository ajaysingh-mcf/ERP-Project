/**
 * GET /api/masters/material-master/export
 *
 * Exports base material records (no rate data) for either the RM or PM view.
 * The `material` param mirrors the toggle on /masters/material-master so the
 * downloaded file always matches what the user is looking at.
 *
 * Query params (all optional):
 *   format   — "csv" (default) | "xlsx"
 *   material — "pm" | anything else → RM (default)
 *   search   — searches code, name, and make/type
 *   status   — "active" | "discontinued"
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
import { rawMaterials as rmSql }                from "@/lib/queries/raw-materials"
import { packingMaterials as pmSql }            from "@/lib/queries/packing-materials"
import { buildCsv, buildXlsx }                 from "@/lib/export"
import { RM_BASE_EXPORT_COLUMNS, PM_BASE_EXPORT_COLUMNS } from "@/lib/export-configs"

const ROW_LIMIT = 50_000

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp       = req.nextUrl.searchParams
  const format   = sp.get("format")   === "xlsx" ? "xlsx" : "csv"
  const isPm     = sp.get("material") === "pm"
  const search   = sp.get("search")  ?? ""
  const status   = sp.get("status")  ?? ""

  const like        = search ? `%${search}%` : null
  const statusParam = status || null

  // Params match selectPaginated / countAll: [like×4, status×2]
  const filterParams = [like, like, like, like, statusParam, statusParam]

  const columns   = isPm ? PM_BASE_EXPORT_COLUMNS  : RM_BASE_EXPORT_COLUMNS
  const countSql  = isPm ? pmSql.countAll           : rmSql.countAll
  const dataSql   = isPm ? pmSql.selectBaseAllFiltered : rmSql.selectBaseAllFiltered
  const typeLabel = isPm ? "pm"                     : "rm"
  const sheetName = isPm ? "Packing Materials"      : "Raw Materials"

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
    const filename = `material_master_${typeLabel}_${date}.${format}`

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
    console.error("[/api/masters/material-master/export]", err)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
