/**
 * GET /api/masters/bom-master/export
 *
 * Exports all BOM detail rows matching the current active filters as CSV or Excel.
 *
 * Query params (all optional):
 *   format — "csv" (default) | "xlsx"
 *   search — searches bom_code and sku_code
 *   type   — "rm" | "pm"  (material type)
 *   status — "draft" | "active" | "inactive" | "in review" | "discontinued"
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
import { bom as bomSql } from "@/lib/queries/bom"
import { buildCsv, buildXlsx, buildExportFilename } from "@/lib/export"
import { BOM_EXPORT_COLUMNS } from "@/lib/export-configs"

const ROW_LIMIT = 50_000

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv"
  const search = sp.get("search") ?? ""
  const type   = sp.get("type")   ?? ""
  const status = sp.get("status") ?? ""

  const like        = search ? `%${search}%` : null
  const typeParam   = type   || null
  const statusParam = status || null

  // Params match selectPaginated / countAll: [like×3, type×2, status×2]
  const filterParams = [like, like, like, typeParam, typeParam, statusParam, statusParam]

  try {
    const [{ total }] = await query<{ total: number }>(
      bomSql.countAll,
      filterParams
    )
    if (total > ROW_LIMIT) {
      return NextResponse.json(
        { error: `Export limited to ${ROW_LIMIT.toLocaleString()} rows. Query returned ${total.toLocaleString()}. Apply filters to narrow the result.` },
        { status: 413 }
      )
    }

    const rows = await query<Record<string, unknown>>(
      bomSql.selectAllFiltered,
      filterParams
    )

    const filename = buildExportFilename("bom_master", format, { type: type || null, status: status || null, search: search || null })

    if (format === "xlsx") {
      const buffer = await buildXlsx("BOM Master", BOM_EXPORT_COLUMNS, rows)
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    const csv = buildCsv(BOM_EXPORT_COLUMNS, rows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error("[/api/masters/bom-master/export]", err)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
