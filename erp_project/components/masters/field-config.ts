// Shared field schema that drives BOTH the Add form and the CSV importer for
// every master-data page. Declare a list of MasterField once per entity and
// pass it to <AddRecordDialog> and <CsvImportDialog>.

export type FieldType = "text" | "number" | "select"

export type FieldOption = { value: string; label: string }

export type MasterField = {
  /** Canonical key — matches the DB column and the JSON payload key. */
  key: string
  /** Display label (Add-form label + CSV preview header). */
  label: string
  /** Input kind in the Add form. Defaults to "text". */
  type?: FieldType
  /** Required in both the form and CSV validation. */
  required?: boolean
  /** Placeholder for text/number inputs. */
  placeholder?: string
  /** Options for a "select" field. */
  options?: FieldOption[]
  /** Default value: Add-form initial value AND CSV fallback when blank. */
  default?: string
  /** Extra CSV header names accepted besides `key` (case-insensitive). */
  aliases?: string[]
  /** Transform a raw CSV cell into the value sent to the API. */
  parse?: (raw: string) => unknown
  /** Sample value written into the downloadable CSV template. */
  sample?: string
  /** Include this field in the CSV flow. Default true. */
  csv?: boolean
  /** Include this field in the Add form. Default true. */
  form?: boolean
  /** Grid span in the Add form (1 or 2 columns). Default 1. */
  colSpan?: 1 | 2
}

export type ParsedRow = Record<string, unknown> & { _error?: string }

const unquote = (s: string) => s.trim().replace(/^"|"$/g, "")

export function csvFields(fields: MasterField[]) {
  return fields.filter((f) => f.csv !== false)
}

export function formFields(fields: MasterField[]) {
  return fields.filter((f) => f.form !== false)
}

export function emptyForm(fields: MasterField[]): Record<string, string> {
  return Object.fromEntries(formFields(fields).map((f) => [f.key, f.default ?? ""]))
}

/** Parse CSV text into rows keyed by field. Invalid rows carry `_error`. */
export function parseCSV(text: string, fields: MasterField[]): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row")
  }
  const headers = lines[0].split(",").map((h) => unquote(h).toLowerCase())
  const cols = csvFields(fields)

  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const values = line.split(",").map(unquote)
      const raw: Record<string, string> = {}
      headers.forEach((h, i) => {
        raw[h] = values[i] ?? ""
      })

      const row: ParsedRow = {}
      const missing: string[] = []
      for (const f of cols) {
        const keys = [f.key, ...(f.aliases ?? [])].map((k) => k.toLowerCase())
        let val = ""
        for (const k of keys) {
          if (raw[k]) {
            val = raw[k]
            break
          }
        }
        if (!val && f.default != null) val = f.default
        if (!val && f.required) missing.push(f.key)
        row[f.key] = f.parse && val ? f.parse(val) : val
      }
      if (missing.length) row._error = `Missing required: ${missing.join(", ")}`
      return row
    })
}

/** Build a CSV template string (header row + one sample row) from the fields. */
export function buildTemplate(fields: MasterField[]): string {
  const cols = csvFields(fields)
  const header = cols.map((f) => f.key).join(",")
  const sample = cols.map((f) => f.sample ?? f.default ?? "").join(",")
  return `${header}\n${sample}`
}
