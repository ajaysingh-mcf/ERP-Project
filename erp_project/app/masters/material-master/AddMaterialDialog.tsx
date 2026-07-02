"use client"

import { useState, useEffect } from "react"
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

/** Extra fields only on Packing Materials. */
type PmExtra = {
  pantone_color: string
}

const UOM_OPTIONS = ["kg", "g", "l", "ml", "pcs", "m"]

// ─── Default state helpers ────────────────────────────────────────────────────

const defaultBase = (mat: "rm" | "pm"): BaseFields => ({
  name: "",
  type: "",
  uom: mat === "pm" ? "pcs" : "kg",
  hsn_code: "",
  status: "active",
})

const defaultRmExtra = (): RmExtra => ({
  make: "",
  inci_name: "",
})

const defaultPmExtra = (): PmExtra => ({
  pantone_color: "",
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
  const [base, setBase] = useState<BaseFields>(() => defaultBase(material))

  // RM-only fields.
  const [rmExtra, setRmExtra] = useState<RmExtra>(defaultRmExtra)
  // PM-only fields.
  const [pmExtra, setPmExtra] = useState<PmExtra>(defaultPmExtra)

  // Managed dropdown options for RM Make and INCI Name.
  const [makeOptions, setMakeOptions] = useState<string[]>([])
  const [inciOptions, setInciOptions] = useState<string[]>([])
  const [makeIsNew, setMakeIsNew] = useState(false)
  const [inciIsNew, setInciIsNew] = useState(false)

  useEffect(() => {
    if (!open || material !== "rm") return
    fetch("/api/masters/raw-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get-makes" }),
    }).then((r) => r.json()).then((d) => setMakeOptions(d.makes ?? [])).catch(() => {})
    fetch("/api/masters/raw-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get-inci-names" }),
    }).then((r) => r.json()).then((d) => setInciOptions(d.inciNames ?? [])).catch(() => {})
  }, [open, material])

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Reset all form fields and errors back to blank. */
  function reset() {
    setBase(defaultBase(material))
    setRmExtra(defaultRmExtra())
    setPmExtra(defaultPmExtra())
    setMakeIsNew(false)
    setInciIsNew(false)
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
              pantone_color: pmExtra.pantone_color.trim() || null,
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
                {/* Make — managed dropdown with "+ Add new" option */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mat-make">
                    Make <span className="text-destructive">*</span>
                  </Label>
                  {makeIsNew ? (
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Enter new make…"
                        value={rmExtra.make}
                        onChange={(e) => setRmField("make", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => { setMakeIsNew(false); setRmField("make", "") }}
                        className="h-9 px-2 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground text-sm"
                      >✕</button>
                    </div>
                  ) : (
                    <select
                      id="mat-make"
                      value={rmExtra.make}
                      onChange={(e) => {
                        if (e.target.value === "__new__") { setMakeIsNew(true); setRmField("make", "") }
                        else setRmField("make", e.target.value)
                      }}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select make…</option>
                      {makeOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="__new__">+ Add new…</option>
                    </select>
                  )}
                </div>

                {/* INCI Name — managed dropdown with "+ Add new" option */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mat-inci">
                    INCI Name <span className="text-destructive">*</span>
                  </Label>
                  {inciIsNew ? (
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Enter new INCI name…"
                        value={rmExtra.inci_name}
                        onChange={(e) => setRmField("inci_name", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => { setInciIsNew(false); setRmField("inci_name", "") }}
                        className="h-9 px-2 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground text-sm"
                      >✕</button>
                    </div>
                  ) : (
                    <select
                      id="mat-inci"
                      value={rmExtra.inci_name}
                      onChange={(e) => {
                        if (e.target.value === "__new__") { setInciIsNew(true); setRmField("inci_name", "") }
                        else setRmField("inci_name", e.target.value)
                      }}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select INCI name…</option>
                      {inciOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                      <option value="__new__">+ Add new…</option>
                    </select>
                  )}
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
              <select
                id="mat-type"
                value={base.type}
                onChange={(e) => setField("type", e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select type…</option>
                {(material === "rm"
                  ? ["API", "Excipient", "Fragrance", "Surfactant", "Preservative"]
                  : ["Label", "Carton", "Bottle", "Pouch", "Cap", "Shrink Sleeve"]
                ).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* UOM — unit of measure */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat-uom">UOM</Label>
              <select
                id="mat-uom"
                value={base.uom}
                onChange={(e) => setField("uom", e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select UOM…</option>
                {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
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

            {/* Pantone Color — PM only */}
            {material === "pm" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mat-pantone">Pantone Color</Label>
                <Input
                  id="mat-pantone"
                  placeholder="e.g. PMS 185 C"
                  value={pmExtra.pantone_color}
                  onChange={(e) => setPmExtra((p) => ({ ...p, pantone_color: e.target.value }))}
                />
              </div>
            )}

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
