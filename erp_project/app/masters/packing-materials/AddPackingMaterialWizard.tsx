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
import { QuickCreateVendorModal } from "@/components/masters/QuickCreateVendorModal"
import { QuickCreateManufacturerModal } from "@/components/masters/QuickCreateManufacturerModal"
import { useToast } from "@/components/ui/toast"

type PmFormData = {
  name: string
  type: string
  hsn_code: string
  uom: string
  pantone_color: string
  status: string
}

type VendorEntry = {
  vendor_id: number | null
  vendor_code: string
  curr_rate: string
  moq: string
  rate_uom: string
}

type MfgEntry = {
  mfg_id: number | null
  mfg_code: string
  curr_rate: string
  rate_uom: string
  effective_from: string
}

const UOM_OPTIONS = ["kg", "g", "l", "ml", "pcs", "m"]

const DEFAULT_PM: PmFormData = {
  name: "", type: "", hsn_code: "", uom: "pcs", pantone_color: "", status: "active",
}

const DEFAULT_VENDOR_ENTRY: VendorEntry = {
  vendor_id: null, vendor_code: "", curr_rate: "", moq: "", rate_uom: "pcs",
}

const DEFAULT_MFG_ENTRY: MfgEntry = {
  mfg_id: null, mfg_code: "", curr_rate: "", rate_uom: "pcs", effective_from: "",
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
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wizardMode, setWizardMode] = useState<"create" | "add-rates">("create")
  const [showDuplicateOptions, setShowDuplicateOptions] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [pmData, setPmData] = useState<PmFormData>(DEFAULT_PM)
  const [vendorEntries, setVendorEntries] = useState<VendorEntry[]>([{ ...DEFAULT_VENDOR_ENTRY }])
  const [mfgEntries, setMfgEntries] = useState<MfgEntry[]>([{ ...DEFAULT_MFG_ENTRY }])
  const [existingRates, setExistingRates] = useState<Record<number, { curr_rate: string; moq: string } | null>>({})
  const [vendorOptions, setVendorOptions] = useState<Vendor[]>(vendors)
  const [mfgOptions, setMfgOptions] = useState<Mfg[]>(manufacturers)
  const [quickVendorOpen, setQuickVendorOpen] = useState(false)
  const [quickMfgOpen, setQuickMfgOpen] = useState(false)

  const isDirty = pmData.name !== "" || pmData.type !== "" || step > 1
  
  function resetAll() {
    setStep(1)
    setError(null)
    setWizardMode("create")
    setShowDuplicateOptions(false)
    setShowCloseConfirm(false)
    setPmData(DEFAULT_PM)
    setVendorEntries([{ ...DEFAULT_VENDOR_ENTRY }])
    setMfgEntries([{ ...DEFAULT_MFG_ENTRY }])
    setExistingRates({})
    setLoading(false)
  }

  function closeWizard() {
    setOpen(false)
    resetAll()
  }

  function requestClose() {
    if (isDirty) {
      setShowCloseConfirm(true)
    } else {
      closeWizard()
    }
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
        setShowDuplicateOptions(true)
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
    const filled = vendorEntries.filter((v) => v.vendor_id !== null)
    for (const v of filled) {
      if (!v.curr_rate.trim() || !v.moq.trim()) {
        setError("Each vendor entry requires a rate and MOQ.")
        return
      }
    }
    const ids = filled.map((v) => v.vendor_id)
    if (new Set(ids).size !== ids.length) {
      setError("The same vendor cannot be added twice. Remove the duplicate entry.")
      return
    }
    setVendorEntries(filled)
    setStep(3)
  }

  function handleSkipVendors() {
    setError(null)
    setVendorEntries([])
    setExistingRates({})
    setStep(3)
  }

  async function handleSubmit() {
    setError(null)
    const filledMfgs = mfgEntries.filter((m) => m.mfg_id !== null)
    for (const m of filledMfgs) {
      if (!m.curr_rate.trim()) {
        setError("Each manufacturer entry requires a rate.")
        return
      }
    }
    const mfgIds = filledMfgs.map((m) => m.mfg_id)
    if (new Set(mfgIds).size !== mfgIds.length) {
      setError("The same manufacturer cannot be added twice. Remove the duplicate entry.")
      return
    }
    if (wizardMode === "add-rates" && vendorEntries.length === 0 && filledMfgs.length === 0) {
      setError("Add at least one vendor rate or manufacturer to proceed.")
      return
    }
    const mfgPayload = filledMfgs.map((m) => ({
      mfg_id: m.mfg_id,
      mfg_code: m.mfg_code,
      curr_rate: Number(m.curr_rate),
      rate_uom: m.rate_uom,
      effective_from: m.effective_from || null,
    }))
    setLoading(true)
    try {
      const payload =
        wizardMode === "add-rates"
          ? {
              action: "add-rates",
              name: pmData.name.trim(),
              type: pmData.type.trim(),
              vendors: vendorEntries.map((v) => ({
                vendor_id: v.vendor_id,
                vendor_code: v.vendor_code,
                curr_rate: Number(v.curr_rate),
                moq: Number(v.moq),
                rate_uom: v.rate_uom,
              })),
              manufacturers: mfgPayload,
            }
          : {
              action: "create-full",
              pm: pmData,
              vendors: vendorEntries.map((v) => ({
                vendor_id: v.vendor_id,
                vendor_code: v.vendor_code,
                curr_rate: Number(v.curr_rate),
                moq: Number(v.moq),
                rate_uom: v.rate_uom,
              })),
              manufacturers: mfgPayload,
            }

      const res = await fetch("/api/masters/packing-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save material")
      closeWizard()
      toast({
        title: wizardMode === "add-rates" ? "Rates added" : "Packing material created",
        description: pmData.name.trim(),
        variant: "success",
      })
      onSuccess()
    } catch (e: any) {
      setError(e.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const pmVendors = vendorOptions.filter((v) => v.type === "pm" || v.type === "both")

  async function selectVendor(index: number, vendorId: number) {
    const vendor = vendorOptions.find((v) => v.vendor_id === vendorId)
    setVendorEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, vendor_id: vendorId || null, vendor_code: vendor?.code ?? "" }
          : e
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
      // Non-fatal — skip warning if check fails
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

  function selectMfgInEntry(index: number, mfgId: number) {
    const mfg = mfgOptions.find((m) => m.mfg_id === mfgId)
    setMfgEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, mfg_id: mfgId || null, mfg_code: mfg?.code ?? "" }
          : e
      )
    )
  }

  function updateMfgEntry(index: number, field: keyof MfgEntry, value: string) {
    setMfgEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    )
  }

  function removeMfgEntry(index: number) {
    setMfgEntries((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add Packing Material
      </Button>

      {/* <QuickCreateVendorModal
        open={quickVendorOpen}
        defaultType="pm"
        onClose={() => setQuickVendorOpen(false)}
        onSuccess={(v) => {
          setVendorOptions((prev) => [...prev, v])
          setVendorEntries((prev) => {
            const allBlank = prev.every((e) => !e.vendor_id)
            const newEntry = { ...DEFAULT_VENDOR_ENTRY, vendor_id: v.vendor_id, vendor_code: v.code }
            return allBlank ? [newEntry] : [...prev, newEntry]
          })
          setQuickVendorOpen(false)
        }}
      /> */}

      {/* <QuickCreateManufacturerModal
        open={quickMfgOpen}
        onClose={() => setQuickMfgOpen(false)}
        onSuccess={(m) => {
          setMfgOptions((prev) => [...prev, m])
          setMfgEntries((prev) => {
            const allBlank = prev.every((e) => !e.mfg_id)
            const newEntry = { ...DEFAULT_MFG_ENTRY, mfg_id: m.mfg_id, mfg_code: m.code }
            return allBlank ? [newEntry] : [...prev, newEntry]
          })
          setQuickMfgOpen(false)
        }}
      /> */}

      <Dialog open={open} onOpenChange={(v) => { if (!v) requestClose() }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {wizardMode === "add-rates"
                ? `Add Rates to Existing Material — Step ${step} of 3`
                : `Add New Packing Material — Step ${step} of 3`}
            </DialogTitle>
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

          {/* ── Close confirmation overlay ── */}
          {showCloseConfirm ? (
            <div className="py-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">You have unsaved changes. Close and discard?</p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" size="sm" onClick={() => setShowCloseConfirm(false)}>
                  Keep editing
                </Button>
                <Button variant="destructive" size="sm" onClick={closeWizard}>
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Error banner */}
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* ── Step 1: Material Details ── */}
              {step === 1 && (
                showDuplicateOptions ? (
                  <div className="space-y-4 py-2">
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                      A packing material with this name and type already exists.
                    </div>
                    <p className="text-sm text-muted-foreground">What would you like to do?</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setShowDuplicateOptions(false); setError(null) }}
                      >
                        Edit fields
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setShowDuplicateOptions(false)
                          setWizardMode("add-rates")
                          setStep(2)
                        }}
                      >
                        Add vendors / manufacturers to this material →
                      </Button>
                    </div>
                  </div>
                ) : (
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
                      <select
                        className={inputCls}
                        value={pmData.type}
                        onChange={(e) => setPmData((p) => ({ ...p, type: e.target.value }))}
                      >
                        <option value="">Select type…</option>
                        {["Label", "Carton", "Bottle", "Pouch", "Cap", "Shrink Sleeve"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
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
                      <select
                        className={inputCls}
                        value={pmData.uom}
                        onChange={(e) => setPmData((p) => ({ ...p, uom: e.target.value }))}
                      >
                        {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Field>
                    <Field label="Pantone Color">
                      <input
                        className={inputCls}
                        placeholder="e.g. PMS 485"
                        value={pmData.pantone_color}
                        onChange={(e) => setPmData((p) => ({ ...p, pantone_color: e.target.value }))}
                      />
                    </Field>
                  </div>
                )
              )}

              {/* ── Step 2: Vendor Pricing ── */}
              {step === 2 && (
                <div className="space-y-3">
                  {wizardMode === "add-rates" && (
                    <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                      Adding rates to: <strong>{pmData.name}</strong> ({pmData.type})
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Add vendor pricing (optional).</p>
                    {/* <button
                      type="button"
                      onClick={() => setQuickVendorOpen(true)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      New Vendor
                    </button> */}
                  </div>

                  {pmVendors.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                      No vendors available. Use <strong>New Vendor</strong> above to create one.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {vendorEntries.map((entry, i) => (
                        <div key={i} className="rounded-lg border bg-card p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Vendor {i + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeVendorEntry(i)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
                                step="0.01"
                                min="0"
                                className={inputCls}
                                placeholder="0.00"
                                value={entry.curr_rate}
                                onChange={(e) => updateVendorEntry(i, "curr_rate", e.target.value)}
                              />
                            </Field>
                            <Field label="MOQ" required>
                              <input
                                type="number"
                                step="1"
                                min="1"
                                className={inputCls}
                                placeholder="Min qty"
                                value={entry.moq}
                                onChange={(e) => updateVendorEntry(i, "moq", e.target.value.replace(/[^\d]/g, ""))}
                              />
                            </Field>
                            <Field label="Rate UOM">
                              <select
                                className={inputCls}
                                value={entry.rate_uom}
                                onChange={(e) => updateVendorEntry(i, "rate_uom", e.target.value)}
                              >
                                {UOM_OPTIONS.map((u) => (
                                  <option key={u} value={u}>{u}</option>
                                ))}
                              </select>
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
                </div>
              )}

              {/* ── Step 3: Approved Manufacturers ── */}
              {step === 3 && (
                <div>
                  {wizardMode === "add-rates" && (
                    <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 mb-3">
                      Adding rates to: <strong>{pmData.name}</strong> ({pmData.type})
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground">
                      Add approved manufacturers with vendor and rate (optional).
                    </p>
                    {/* <button
                      type="button"
                      onClick={() => setQuickMfgOpen(true)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      New Manufacturer
                    </button> */}
                  </div>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {mfgEntries.map((entry, i) => (
                      <div key={i} className="rounded-lg border bg-card p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Manufacturer {i + 1}
                          </span>
                          {mfgEntries.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeMfgEntry(i)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div>
                          <label className={labelCls}>
                            Manufacturer <span className="text-destructive">*</span>
                          </label>
                          <select
                            className={inputCls}
                            value={entry.mfg_id ?? ""}
                            onChange={(e) => selectMfgInEntry(i, Number(e.target.value))}
                          >
                            <option value="">Select manufacturer…</option>
                            {mfgOptions.map((m) => (
                              <option key={m.mfg_id} value={m.mfg_id}>
                                {m.name} ({m.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <Field label="Rate (₹)" required>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className={inputCls}
                              placeholder="0.00"
                              value={entry.curr_rate}
                              onChange={(e) => updateMfgEntry(i, "curr_rate", e.target.value)}
                            />
                          </Field>
                          <Field label="Rate UOM">
                            <select
                              className={inputCls}
                              value={entry.rate_uom}
                              onChange={(e) => updateMfgEntry(i, "rate_uom", e.target.value)}
                            >
                              {UOM_OPTIONS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Effective From">
                            <input
                              type="date"
                              className={inputCls}
                              value={entry.effective_from}
                              onChange={(e) => updateMfgEntry(i, "effective_from", e.target.value)}
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMfgEntries((p) => [...p, { ...DEFAULT_MFG_ENTRY }])}
                      className="w-full rounded-lg border border-dashed border-muted-foreground/40 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add another manufacturer
                    </button>
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
                  <Button variant="outline" size="sm" onClick={requestClose} disabled={loading}>
                    Cancel
                  </Button>
                  {step === 1 && !showDuplicateOptions && (
                    <Button size="sm" onClick={handleStep1Next} disabled={loading}>
                      {loading ? "Checking…" : "Next →"}
                    </Button>
                  )}
                  {step === 2 && (
                    <>
                      <Button variant="ghost" size="sm" onClick={handleSkipVendors} disabled={loading}>
                        Skip →
                      </Button>
                      <Button size="sm" onClick={handleStep2Next} disabled={loading}>
                        Next →
                      </Button>
                    </>
                  )}
                  {step === 3 && (
                    <Button size="sm" onClick={handleSubmit} disabled={loading}>
                      {loading ? "Saving…" : wizardMode === "add-rates" ? "Save Rates" : "Create Material"}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
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
