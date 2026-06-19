"use client"

import { useState } from "react"
import { CheckCircle2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { Vendor, Mfg } from "@/types/masters"

type PmFormData = {
  name: string
  type: string
  hsn_code: string
  uom: string
  status: string
}

type VendorEntry = {
  vendor_id: number | null
  vendor_code: string
  curr_rate: string
  moq: string
  rate_uom: string
}

const DEFAULT_PM: PmFormData = {
  name: "", type: "", hsn_code: "", uom: "", status: "active",
}

const DEFAULT_VENDOR_ENTRY: VendorEntry = {
  vendor_id: null, vendor_code: "", curr_rate: "", moq: "", rate_uom: "",
}

const STEPS = ["Material Details", "Vendor Pricing", "Approved At"]

export function AddPackingMaterialWizard({
  vendors,
  manufacturers,
  onSuccess,
}: {
  vendors: Vendor[]
  manufacturers: Mfg[]
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pmData, setPmData] = useState<PmFormData>(DEFAULT_PM)
  const [vendorEntries, setVendorEntries] = useState<VendorEntry[]>([{ ...DEFAULT_VENDOR_ENTRY }])
  const [selectedMfgs, setSelectedMfgs] = useState<Array<{ mfg_id: number; mfg_code: string }>>([])
  const [existingRates, setExistingRates] = useState<Record<number, { curr_rate: string; moq: string } | null>>({})

  function resetAll() {
    setStep(1)
    setError(null)
    setPmData(DEFAULT_PM)
    setVendorEntries([{ ...DEFAULT_VENDOR_ENTRY }])
    setSelectedMfgs([])
    setExistingRates({})
    setLoading(false)
  }

  function handleClose() {
    setOpen(false)
    resetAll()
  }

  async function handleStep1Next() {
    setError(null)
    if (!pmData.name.trim() || !pmData.type.trim()) {
      setError("Name and Type are required.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/masters/packing-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check-PM",
          name: pmData.name.trim(),
          type: pmData.type.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Check failed")
      if (data.exists) {
        setError("A packing material with this name and type already exists.")
        return
      }
      setStep(2)
    } catch (e: any) {
      setError(e.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  function handleStep2Next() {
    setError(null)
    for (const v of vendorEntries) {
      if (!v.vendor_id || !v.curr_rate.trim() || !v.moq.trim()) {
        setError("Each vendor entry requires a vendor, rate and MOQ.")
        return
      }
    }
    setStep(3)
  }

  async function handleSubmit() {
    setError(null)
    if (selectedMfgs.length === 0) {
      setError("Select at least one approved manufacturer.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/masters/packing-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-full",
          pm: pmData,
          vendors: vendorEntries.map((v) => ({
            vendor_id: v.vendor_id,
            vendor_code: v.vendor_code,
            curr_rate: Number(v.curr_rate),
            moq: Number(v.moq),
            rate_uom: v.rate_uom,
          })),
          manufacturers: selectedMfgs,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create material")
      handleClose()
      onSuccess()
    } catch (e: any) {
      setError(e.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const pmVendors = vendors.filter((v) => v.type === "pm" || v.type === "both")

  async function selectVendor(index: number, vendorId: number) {
    const vendor = vendors.find((v) => v.vendor_id === vendorId)
    setVendorEntries((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, vendor_id: vendorId, vendor_code: vendor?.code ?? "" } : e
      )
    )
    setExistingRates((prev) => ({ ...prev, [index]: null }))
    if (!vendorId) return
    try {
      const res = await fetch("/api/masters/packing-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check-vendor",
          name: pmData.name.trim(),
          type: pmData.type.trim(),
          vendor_id: vendorId,
        }),
      })
      const data = await res.json()
      if (res.ok && data.exists) {
        setExistingRates((prev) => ({
          ...prev,
          [index]: { curr_rate: data.existing.curr_rate, moq: data.existing.moq },
        }))
      }
    } catch {
      // Non-fatal — skip warning if check fails.
    }
  }

  function updateVendorEntry(index: number, field: keyof VendorEntry, value: string) {
    setVendorEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    )
  }

  function removeVendorEntry(index: number) {
    setVendorEntries((prev) => prev.filter((_, i) => i !== index))
    setExistingRates((prev) => {
      const next: typeof prev = {}
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k)
        if (ki < index) next[ki] = v
        else if (ki > index) next[ki - 1] = v
      })
      return next
    })
  }

  function toggleMfg(mfg: Mfg) {
    const id = mfg.mfg_id
    setSelectedMfgs((prev) =>
      prev.some((m) => m.mfg_id === id)
        ? prev.filter((m) => m.mfg_id !== id)
        : [...prev, { mfg_id: id, mfg_code: mfg.code }]
    )
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add Packing Material
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Packing Material — Step {step} of 3</DialogTitle>
          </DialogHeader>

          {/* Progress stepper */}
          <div className="flex items-center mb-1">
            {STEPS.map((label, i) => {
              const s = (i + 1) as 1 | 2 | 3
              const done = step > s
              const active = step === s
              return (
                <div key={s} className="flex items-center">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                        done && "bg-teal-600 text-white",
                        active && "bg-foreground text-background",
                        !done && !active && "border border-muted-foreground text-muted-foreground"
                      )}
                    >
                      {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
                    </div>
                    <span className={cn("text-sm whitespace-nowrap", active ? "font-medium" : "text-muted-foreground")}>
                      {label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="h-px w-6 bg-border mx-3 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* ── Step 1: Material Details ── */}
          {step === 1 && (
            <div className="grid grid-cols-3 gap-4">
              <Field label="Name" required className="col-span-2">
                <input
                  className={inputCls}
                  placeholder="e.g. Label 100ml"
                  value={pmData.name}
                  onChange={(e) => setPmData((p) => ({ ...p, name: e.target.value }))}
                />
              </Field>
              <Field label="Type" required>
                <input
                  className={inputCls}
                  placeholder="e.g. Label / Carton"
                  value={pmData.type}
                  onChange={(e) => setPmData((p) => ({ ...p, type: e.target.value }))}
                />
              </Field>
              <Field label="HSN Code">
                <input
                  className={inputCls}
                  placeholder="e.g. 48191000"
                  value={pmData.hsn_code}
                  onChange={(e) => setPmData((p) => ({ ...p, hsn_code: e.target.value }))}
                />
              </Field>
              <Field label="UOM">
                <input
                  className={inputCls}
                  placeholder="e.g. pcs"
                  value={pmData.uom}
                  onChange={(e) => setPmData((p) => ({ ...p, uom: e.target.value }))}
                />
              </Field>
              <Field label="Status">
                <select
                  className={inputCls}
                  value={pmData.status}
                  onChange={(e) => setPmData((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="discontinued">Discontinued</option>
                </select>
              </Field>
            </div>
          )}

          {/* ── Step 2: Vendor Pricing ── */}
          {step === 2 && (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {vendorEntries.map((entry, i) => (
                <div key={i} className="rounded-lg border bg-card p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Vendor {i + 1}
                    </span>
                    {vendorEntries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeVendorEntry(i)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>
                      Vendor <span className="text-destructive">*</span>
                    </label>
                    <select
                      className={inputCls}
                      value={entry.vendor_id ?? ""}
                      onChange={(e) => selectVendor(i, Number(e.target.value))}
                    >
                      <option value="">Select vendor…</option>
                      {pmVendors.map((v) => (
                        <option key={v.vendor_id} value={v.vendor_id}>
                          {v.name} ({v.code})
                        </option>
                      ))}
                    </select>
                    {existingRates[i] && (
                      <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        ⚠ Existing rate: ₹{existingRates[i]!.curr_rate} · MOQ {existingRates[i]!.moq} — old values will be archived and updated.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Rate (₹)" required>
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="0.00"
                        value={entry.curr_rate}
                        onChange={(e) => updateVendorEntry(i, "curr_rate", e.target.value)}
                      />
                    </Field>
                    <Field label="MOQ" required>
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="Min qty"
                        value={entry.moq}
                        onChange={(e) => updateVendorEntry(i, "moq", e.target.value)}
                      />
                    </Field>
                    <Field label="Rate UOM">
                      <input
                        className={inputCls}
                        placeholder="e.g. pcs"
                        value={entry.rate_uom}
                        onChange={(e) => updateVendorEntry(i, "rate_uom", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setVendorEntries((p) => [...p, { ...DEFAULT_VENDOR_ENTRY }])}
                className="w-full rounded-lg border border-dashed border-muted-foreground/40 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add another vendor
              </button>
            </div>
          )}

          {/* ── Step 3: Approved Manufacturers ── */}
          {step === 3 && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Select manufacturers approved to supply this material (at least one required).
              </p>
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {manufacturers.map((mfg) => {
                  const selected = selectedMfgs.some((m) => m.mfg_id === mfg.mfg_id)
                  return (
                    <button
                      key={mfg.mfg_id}
                      type="button"
                      onClick={() => toggleMfg(mfg)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        selected
                          ? "border-teal-600 bg-teal-50 dark:bg-teal-950/30"
                          : "border-border hover:border-muted-foreground"
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{mfg.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{mfg.code}</div>
                        </div>
                        {selected && <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              {step > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setError(null); setStep((s) => (s - 1) as 1 | 2 | 3) }}
                  disabled={loading}
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              {step < 3 ? (
                <Button
                  size="sm"
                  onClick={step === 1 ? handleStep1Next : handleStep2Next}
                  disabled={loading}
                >
                  {loading ? "Checking…" : "Next →"}
                </Button>
              ) : (
                <Button size="sm" onClick={handleSubmit} disabled={loading}>
                  {loading ? "Creating…" : "Create Material"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Small helpers ──────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

const labelCls = "block text-xs font-medium mb-1"

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className={labelCls}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
