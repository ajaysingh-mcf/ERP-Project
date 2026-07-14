import { getFileBuffer } from "@/lib/s3"
import ExcelJS from "exceljs"

export type ImportRow = Record<string, string>

/**
 * Fetch a CSV or Excel file from the files S3 bucket and return its rows
 * as an array of plain string objects keyed by the header row.
 *
 * Supports: .csv, .xlsx
 */
export async function parseS3Import(key: string): Promise<ImportRow[]> {
  const buffer = await getFileBuffer(key)
  const ext    = key.split(".").pop()?.toLowerCase()

  if (ext === "csv") {
    return parseCsvBuffer(buffer as unknown as Buffer)
  }
  if (ext === "xlsx") {
    return parseXlsxBuffer(buffer as unknown as Buffer)
  }
  throw new Error(`Unsupported file type: .${ext}`)
}

function parseCsvBuffer(buffer: Buffer): ImportRow[] {
  const text  = buffer.toString("utf-8")
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const rows: ImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    if (values.every((v) => !v.trim())) continue
    const row: ImportRow = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").trim() })
    rows.push(row)
  }
  return rows
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === "," && !inQuotes) { result.push(current); current = "" }
    else { current += ch }
  }
  result.push(current)
  return result
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any)

  const ws = wb.worksheets[0]
  if (!ws) return []

  const rows: ImportRow[] = []
  let headers: string[] = []

  ws.eachRow((row, rowNumber) => {
    const values = (row.values as (string | number | null)[]).slice(1).map((v) =>
      v == null ? "" : String(v).trim()
    )
    if (rowNumber === 1) {
      headers = values.map((h) => h.toLowerCase())
    } else {
      if (values.every((v) => !v)) return
      const obj: ImportRow = {}
      headers.forEach((h, idx) => { obj[h] = values[idx] ?? "" })
      rows.push(obj)
    }
  })
  return rows
}
