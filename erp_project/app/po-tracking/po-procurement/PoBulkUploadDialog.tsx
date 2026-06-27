"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function PoBulkUploadDialog({
  open, onClose, onSubmitted,
}: {
  open: boolean
  onClose: () => void
  onSubmitted: () => void
}) {
  const [file, setFile]           = useState<File | null>(null)
  const [s3Key, setS3Key]         = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [success, setSuccess]     = useState(false)

  useEffect(() => {
    if (open) {
      setFile(null); setS3Key(null); setUploading(false)
      setSubmitting(false); setUploadError(""); setSubmitError(""); setSuccess(false)
    }
  }, [open])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setUploadError("Only .csv files are supported.")
      return
    }
    setFile(f); setS3Key(null); setUploadError(""); setSubmitError("")
    setUploading(true)

    const yyyymm = new Date().toISOString().slice(0, 7)
    const form   = new FormData()
    form.append("file",   f)
    form.append("folder", `imports/po-bulk/${yyyymm}`)
    form.append("field",  `po_bulk_${f.name}`)

    try {
      const res  = await fetch("/api/upload", { method: "POST", body: form })
      const data = await res.json()
      if (data.key) {
        setS3Key(data.key)
      } else {
        setUploadError(data.error ?? "Upload to S3 failed")
      }
    } catch {
      setUploadError("Upload to S3 failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    if (!s3Key || !file) return
    setSubmitting(true); setSubmitError("")
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_csv", key: s3Key, filename: file.name }),
        // No rowCount — the handler parses the actual count from the file at approve time
      })
      const data = await res.json()
      if (!res.ok) { setSubmitError(data.error ?? "Submission failed"); return }
      setSuccess(true)
      onSubmitted()
    } catch {
      setSubmitError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !uploading && !submitting) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk PO Upload</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="rounded-full bg-emerald-50 p-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-medium text-sm">Submitted for approval</p>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Column reference */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="font-medium text-muted-foreground">Required column order (row 1 = header):</p>
                <a
                  href="/samples/po-bulk-upload-sample.csv"
                  download="po-bulk-upload-sample.csv"
                  className="text-primary underline hover:no-underline text-[11px]"
                >
                  Download sample
                </a>
              </div>
              <code className="block font-mono text-[11px] leading-relaxed">
                mfg_code,sku_code,qty,expected_on,destination
              </code>
            </div>

            {/* File picker */}
            <div className="rounded-lg border-2 border-dashed border-border p-5 text-center">
              <label className="cursor-pointer block">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFile}
                  className="sr-only"
                  disabled={uploading || submitting}
                />
                <div className="flex flex-col items-center gap-2">
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  ) : (
                    <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-primary hover:underline">
                    {uploading ? "Uploading…" : file ? file.name : "Choose .csv file"}
                  </span>
                  {!file && (
                    <span className="text-xs text-muted-foreground">CSV files only</span>
                  )}
                </div>
              </label>

              {s3Key && !uploading && (
                <p className="mt-2 text-xs text-emerald-600">
                  File Uploaded.
                </p>
              )}
            </div>

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          </div>
        )}

        <DialogFooter>
          {success ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={uploading || submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!s3Key || uploading || submitting}
              >
                {submitting
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Submitting…</>
                  : <><Upload className="h-3.5 w-3.5 mr-1.5" /> Submit for Approval</>
                }
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
