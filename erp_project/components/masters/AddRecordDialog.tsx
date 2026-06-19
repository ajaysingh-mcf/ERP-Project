"use client"

import { useState } from "react"
import { Plus, AlertCircle } from "lucide-react"
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
import { type MasterField, formFields, emptyForm } from "./field-config"

export function AddRecordDialog({
  entityLabel,
  title,
  endpoint,
  fields,
  onSuccess,
}: {
  /** Singular label, e.g. "SKU". Used in the button + title. */
  entityLabel: string
  /** Override the dialog title (defaults to "Add {entityLabel}"). */
  title?: string
  /** API route that accepts `{ action: "create", ...fields }`. */
  endpoint: string
  fields: MasterField[]
  onSuccess?: () => void
}) {
  const cols = formFields(fields)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>(() => emptyForm(fields))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function openDialog() {
    setForm(emptyForm(fields))
    setError("")
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const missing = cols.filter(
      (f) => f.required && !String(form[f.key] ?? "").trim()
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
        body: JSON.stringify({ action: "create", ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to add ${entityLabel}`)
      setOpen(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={openDialog}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add {entityLabel}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <DialogContent className="w-lg">
          <DialogHeader>
            <DialogTitle>{title ?? `Add ${entityLabel}`}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-4">
              {cols.map((f) => (
                <div
                  key={f.key}
                  className={cn("space-y-1.5", f.colSpan === 2 && "col-span-2")}
                >
                  <Label htmlFor={f.key}>
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {f.type === "select" ? (
                    <select
                      id={f.key}
                      value={form[f.key] ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, [f.key]: e.target.value }))
                      }
                      className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={f.key}
                      type={f.type === "number" ? "number" : "text"}
                      placeholder={f.placeholder}
                      value={form[f.key] ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, [f.key]: e.target.value }))
                      }
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
                {loading ? "Adding…" : `Add ${entityLabel}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
