"use client"

import { useState } from "react"
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  type MasterField,
  type ParsedRow,
  csvFields,
  parseCSV,
  buildTemplate,
} from "./field-config"

export function CsvImportDialog({
  entityLabel,
  entityLabelPlural,
  title,
  endpoint,
  templateFilename,
  fields,
  onSuccess,
}: {
  /** Singular label, e.g. "SKU". */
  entityLabel: string
  /** Plural label. Defaults to `${entityLabel}s`. */
  entityLabelPlural?: string
  /** Override dialog title (defaults to "Upload {plural} via CSV"). */
  title?: string
  /** API route that accepts `{ action: "bulk", rows }` and returns `{ inserted, skipped }`. */
  endpoint: string
  templateFilename: string
  fields: MasterField[]
  onSuccess?: () => void
}) {
  const cols = csvFields(fields)
  const plural = entityLabelPlural ?? `${entityLabel}s`

  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [filename, setFilename] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const valid = rows.filter((r) => !r._error)
  const invalid = rows.filter((r) => r._error)

  const requiredKeys = cols.filter((f) => f.required).map((f) => f.key)
  const optionalKeys = cols.filter((f) => !f.required).map((f) => f.key)

  function openDialog() {
    setRows([])
    setFilename("")
    setError("")
    setSuccess("")
    setOpen(true)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    setError("")
    setSuccess("")
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        setRows(parseCSV(ev.target?.result as string, fields))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV")
        setRows([])
      }
    }
    reader.readAsText(file)
  }

  async function handleUpload() {
    if (valid.length === 0) {
      setError("No valid rows to upload.")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", rows: valid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      setSuccess(
        data.skipped > 0
          ? `Uploaded ${data.inserted} ${plural}. ${data.skipped} skipped (duplicates).`
          : `Successfully uploaded ${data.inserted} ${plural}.`
      )
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setLoading(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob([buildTemplate(fields)], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = templateFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        Upload CSV
      </Button>

      <Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title ?? `Upload ${plural} via CSV`}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-border p-5 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Required columns:{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {requiredKeys.join(", ") || "—"}
                </code>
                {optionalKeys.length > 0 && (
                  <>
                    {" · "}Optional:{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                      {optionalKeys.join(", ")}
                    </code>
                  </>
                )}
              </p>
              <div className="flex items-center justify-center gap-4">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFile}
                    className="sr-only"
                  />
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                    <Upload className="h-4 w-4" />
                    {filename || "Choose CSV file"}
                  </span>
                </label>
                <span className="text-muted-foreground text-sm">·</span>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  Download template
                </button>
              </div>
              {filename && rows.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {rows.length} rows parsed
                  {invalid.length > 0 && (
                    <span className="text-destructive">
                      {" "}
                      · {invalid.length} invalid
                    </span>
                  )}
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            {success && (
              <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {success}
              </p>
            )}

            {rows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground">
                    Preview — first {Math.min(5, rows.length)} of {rows.length}{" "}
                    rows
                  </span>
                </div>
                <div className="overflow-x-auto max-h-44 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background border-b border-border">
                      <tr>
                        {cols.map((f) => (
                          <th
                            key={f.key}
                            className="px-3 py-2 text-left font-medium text-muted-foreground"
                          >
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, i) => (
                        <tr
                          key={i}
                          className={cn(
                            "border-b border-border last:border-0",
                            row._error && "bg-destructive/5"
                          )}
                        >
                          {cols.map((f) => {
                            const v = row[f.key]
                            const display =
                              v === "" || v == null ? null : String(v)
                            return (
                              <td
                                key={f.key}
                                className="px-3 py-1.5 text-muted-foreground"
                              >
                                {display ??
                                  (f.required ? (
                                    <span className="text-destructive">
                                      missing
                                    </span>
                                  ) : (
                                    "—"
                                  ))}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={valid.length === 0 || loading}
              onClick={handleUpload}
            >
              {loading
                ? "Uploading…"
                : valid.length > 0
                ? `Upload ${valid.length} ${
                    valid.length !== 1 ? plural : entityLabel
                  }`
                : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
