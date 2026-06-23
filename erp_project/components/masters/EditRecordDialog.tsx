"use client"

import { useState } from "react"
import { Pencil, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { type MasterField, formFields } from "./field-config"

export function EditRecordDialog({
  entityLabel,
  endpoint,
  fields,
  initialValues,
  recordId,
  currentStatus,
  onSuccess,
}: {
  /** Singular label, e.g. "SKU". */
  entityLabel: string
  /** API route that accepts `{ action: "update", id, ...fields }`. */
  endpoint: string
  fields: MasterField[]
  /** Current field values for this record. */
  initialValues: Record<string, string>
  /** Primary key sent as `id` in the update payload. */
  recordId: number
  /** Current entity status — used to disable editing when in_review. */
  currentStatus?: string
  onSuccess?: () => void
}) {
  const cols = formFields(fields)
  const [open, setOpen]       = useState(false)
  const [form, setForm]       = useState<Record<string, string>>(initialValues)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  function openDialog() {
    setForm(initialValues)
    setError("")
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const missing = cols.filter(
      (f) => f.required && !f.readonly && !String(form[f.key] ?? "").trim()
    )
    if (missing.length) {
      setError(
        `${missing.map((f) => f.label).join(", ")} ${
          missing.length > 1 ? "are" : "is"
        } required.`
      )
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: recordId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to update ${entityLabel}`)
      setOpen(false)
      // The edit is now routed through the approval workflow.
      if (data.message === "No changes detected") {
        setError("No changes were made.")
        setOpen(true)
        return
      }
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const isLocked = currentStatus === "in_review"

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={openDialog}
        disabled={isLocked}
        title={isLocked ? "Pending approval — cannot edit" : `Edit ${entityLabel}`}
        className="h-7 px-2"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <DialogContent className="w-lg">
          <DialogHeader>
            <DialogTitle>Edit {entityLabel}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-4">
              {cols.map((f) => (
                <div
                  key={f.key}
                  className={cn("space-y-1.5", f.colSpan === 2 && "col-span-2")}
                >
                  <Label htmlFor={`edit-${f.key}`}>
                    {f.label}
                    {f.required && !f.readonly && (
                      <span className="text-destructive"> *</span>
                    )}
                  </Label>
                  {f.type === "select" ? (
                    <select
                      id={`edit-${f.key}`}
                      value={form[f.key] ?? ""}
                      disabled={f.readonly}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, [f.key]: e.target.value }))
                      }
                      className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`edit-${f.key}`}
                      type={f.type === "number" ? "number" : "text"}
                      placeholder={f.placeholder}
                      value={form[f.key] ?? ""}
                      readOnly={f.readonly}
                      disabled={f.readonly}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, [f.key]: e.target.value }))
                      }
                      className={cn(f.readonly && "bg-muted text-muted-foreground cursor-not-allowed")}
                    />
                  )}
                </div>
              ))}
            </div>

            {error && (
              <p className="mt-3 text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
