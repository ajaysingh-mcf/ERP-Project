"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ─── Types ───────────────────────────────────────────────────────────────────

/** Fields common to both RM and PM base inserts. */
type BaseFields = {
  name: string       // Material name — required
  type: string       // e.g. "Solvent", "Carton"
  uom: string        // Unit of measure, e.g. "kg", "pcs"
  hsn_code: string   // HSN code for GST classification
  status: "active" | "discontinued"
}

/** Extra fields only on Raw Materials. */
type RmExtra = {
  make: string       // Brand / manufacturer name — required for duplicate check
  inci_name: string  // International Nomenclature of Cosmetic Ingredients — required
}

// ─── Default state helpers ────────────────────────────────────────────────────

const defaultBase = (): BaseFields => ({
  name: "",
  type: "",
  uom: "",
  hsn_code: "",
  status: "active",
})

const defaultRmExtra = (): RmExtra => ({
  make: "",
  inci_name: "",
})

// ─── Component ───────────────────────────────────────────────────────────────

export default function AddMaterialDialog({
  material,
  onSuccess,
}: {
  /** Which base table to insert into: "rm" or "pm". */
  material: "rm" | "pm"
  /** Called after a successful save so the parent can refresh the table. */
  onSuccess: () => void
}) {
  // Dialog open/close state.
  const [open, setOpen] = useState(false)

  // Loading and error state for the submit button.
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fields shared by both RM and PM.
  const [base, setBase] = useState<BaseFields>(defaultBase)

  // RM-only fields (ignored when material === "pm").
  const [rmExtra, setRmExtra] = useState<RmExtra>(defaultRmExtra)

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Reset all form fields and errors back to blank. */
  function reset() {
    setBase(defaultBase())
    setRmExtra(defaultRmExtra())
    setError(null)
  }

  /** Typed setter for base fields. */
  const setField = (key: keyof BaseFields, value: string) =>
    setBase((prev) => ({ ...prev, [key]: value }))

  /** Typed setter for RM-only fields. */
  const setRmField = (key: keyof RmExtra, value: string) =>
    setRmExtra((prev) => ({ ...prev, [key]: value }))

  // ─── Validation ────────────────────────────────────────────────────────────

  /**
   * Validates required fields before submission.
   * Returns an error message string, or null if valid.
   */
  function validate(): string | null {
    if (!base.name.trim()) return "Name is required."

    if (material === "rm") {
      // RM duplicate-check relies on all three fields being present.
      if (!rmExtra.make.trim()) return "Make is required."
      if (!rmExtra.inci_name.trim()) return "INCI Name is required."
    }

    if (material === "pm") {
      // PM duplicate-check uses name + type.
      if (!base.type.trim()) return "Type is required."
    }

    return null
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    // Run client-side validation before hitting the network.
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Single unified endpoint for both RM and PM base inserts.
      // The "material" field tells the route which table to insert into.
      const endpoint = "/api/masters/material-master"

      const payload =
        material === "rm"
          ? {
              action: "create",
              material: "rm",
              name: base.name.trim(),
              make: rmExtra.make.trim(),
              inci_name: rmExtra.inci_name.trim(),
              type: base.type.trim() || null,
              uom: base.uom.trim() || null,
              hsn_code: base.hsn_code.trim() || null,
              status: base.status,
            }
          : {
              action: "create",
              material: "pm",
              name: base.name.trim(),
              type: base.type.trim(),
              uom: base.uom.trim() || null,
              hsn_code: base.hsn_code.trim() || null,
              status: base.status,
            }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        // Surface the server error message in the form.
        setError(data.error ?? "Something went wrong.")
        return
      }

      // Success — close the dialog, reset fields, and refresh the table.
      setOpen(false)
      reset()
      onSuccess()
    } catch {
      setError("Network error — please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ─── Labels ────────────────────────────────────────────────────────────────

  const label = material === "rm" ? "Raw Material" : "Packing Material"

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger button — sits in the toolbar */}
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Add {label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          // Reset form whenever the dialog is dismissed without submitting.
          if (!v) reset()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add {label}</DialogTitle>
          </DialogHeader>

          {/* ── Form grid ── */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 py-2">

            {/* Name — always required, spans full width */}
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="mat-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mat-name"
                placeholder={
                  material === "rm" ? "e.g. Cetyl Alcohol" : "e.g. Label 100ml"
                }
                value={base.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>

            {/* ── RM-only fields ── */}
            {material === "rm" && (
              <>
                {/* Make — brand / vendor name */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mat-make">
                    Make <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="mat-make"
                    placeholder="e.g. BASF"
                    value={rmExtra.make}
                    onChange={(e) => setRmField("make", e.target.value)}
                  />
                </div>

                {/* INCI Name — used with name + make for duplicate detection */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mat-inci">
                    INCI Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="mat-inci"
                    placeholder="e.g. Cetyl Alcohol"
                    value={rmExtra.inci_name}
                    onChange={(e) => setRmField("inci_name", e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Type — required for PM (used in duplicate check), optional for RM */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat-type">
                Type
                {material === "pm" && (
                  <span className="text-destructive"> *</span>
                )}
              </Label>
              <Input
                id="mat-type"
                placeholder={
                  material === "rm" ? "e.g. Solvent" : "e.g. Label"
                }
                value={base.type}
                onChange={(e) => setField("type", e.target.value)}
              />
            </div>

            {/* UOM — unit of measure */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat-uom">UOM</Label>
              <Input
                id="mat-uom"
                placeholder="e.g. kg, pcs, L"
                value={base.uom}
                onChange={(e) => setField("uom", e.target.value)}
              />
            </div>

            {/* HSN Code — for GST */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat-hsn">HSN Code</Label>
              <Input
                id="mat-hsn"
                placeholder="e.g. 29054500"
                value={base.hsn_code}
                onChange={(e) => setField("hsn_code", e.target.value)}
              />
            </div>

            {/* Status — active by default */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat-status">Status</Label>
              <select
                id="mat-status"
                value={base.status}
                onChange={(e) =>
                  setField("status", e.target.value as BaseFields["status"])
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">Active</option>
                <option value="discontinued">Discontinued</option>
              </select>
            </div>
          </div>

          {/* Inline error message */}
          {error && (
            <p className="text-sm text-destructive -mt-1">{error}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false)
                reset()
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Saving…" : "Save Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
