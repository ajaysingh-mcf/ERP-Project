"use client"

import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import type { ImpromptuForm, MfgOption, SkuOption, WarehouseOption } from "./po-types"
import { EMPTY_FORM } from "./po-types"
import { useQuotedRate } from "./useQuotedRate"

type PoType = "normal" | "impromptu"

export default function AddPODialog({
  open, onClose, skuOptions, mfgOptions, warehouseOptions, onCreated,
}: {
  open: boolean
  onClose: () => void
  skuOptions: SkuOption[]
  mfgOptions: MfgOption[]
  warehouseOptions: WarehouseOption[]
  onCreated: () => void
}) {
  const [poType, setPoType]         = useState<PoType>("normal")
  const [form, setForm]             = useState<ImpromptuForm>(EMPTY_FORM)
  const [errors, setErrors]         = useState<Partial<Record<keyof ImpromptuForm, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError]     = useState("")
  const { toast } = useToast()

  const today = new Date().toISOString().slice(0, 10)
  const defaultDest = warehouseOptions.find((w) => w.type === "MWH")?.name ?? ""
  const { rate: computedRate, loading: rateLoading, error: rateError } = useQuotedRate(form.sku_code, form.mfg_id)

  useEffect(() => {
    if (open) {
      setPoType("normal")
      setForm({ ...EMPTY_FORM, destination: defaultDest })
      setErrors({})
      setApiError("")
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(field: keyof ImpromptuForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
    setApiError("")
  }

  function validate() {
    const e: Partial<Record<keyof ImpromptuForm, string>> = {}
    if (!form.sku_code)                        e.sku_code    = "SKU is required."
    if (!form.mfg_id)                          e.mfg_id      = "Manufacturer is required."
    if (!form.qty || Number(form.qty) <= 0)    e.qty         = "Enter a valid quantity."
    if (!form.expected_on)                     e.expected_on = "Expected dispatch date is required."
    if (form.expected_on && form.expected_on < today)
                                               e.expected_on = "Backdating is not allowed. Select today or a future date."
    if (poType === "impromptu" && !form.reason.trim())
                                               e.reason      = "Remarks are required for Impromptu POs."
    return e
  }

  async function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }

    if (computedRate == null) {
      setApiError(rateError || "Rate could not be computed for this SKU/Manufacturer combination.")
      return
    }

    setSubmitting(true)
    try {
      const unitPrice  = computedRate
      const totalAmt   = Number(form.qty) ? unitPrice * Number(form.qty) : undefined
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_type:      poType,
          mfg_id:       Number(form.mfg_id),
          sku_code:     form.sku_code,
          qty:          Number(form.qty),
          unit_price:   unitPrice,
          total_amount: totalAmt,
          expected_on:  form.expected_on,
          destination:  form.destination || undefined,
          reason:       form.reason.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setApiError(data.error ?? "Failed to submit PO."); return }

      if (poType === "normal") {
        if (data.emailed) {
          toast({
            title: "PO raised",
            description: `${data.po_no} raised and emailed to the manufacturer.`,
            variant: "success",
          })
        } else {
          toast({
            title: "PO raised — email not sent",
            description: data.emailError ?? "Email could not be sent.",
            variant: "error",
          })
        }
      }

      onCreated()
      onClose()
    } catch {
      setApiError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const selectedSku  = skuOptions.find((s) => s.sku_code === form.sku_code)
  const skuNotActive = !!selectedSku && selectedSku.status !== "active"

  const selectCls =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Purchase Order</DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            {poType === "normal"
              ? "Normal POs are raised immediately — no approval needed."
              : "Impromptu POs are submitted for approval before being raised."}
          </p>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {/* SKU */}
          <div className="grid gap-1.5">
            <Label htmlFor="apo-sku">SKU <span className="text-destructive">*</span></Label>
            <select id="apo-sku" value={form.sku_code} onChange={(e) => set("sku_code", e.target.value)} className={selectCls}>
              <option value="">— Select SKU —</option>
              {skuOptions.map((s) => (
                <option key={s.id} value={s.sku_code}>
                  {s.sku_code} — {s.name}{s.status !== "active" ? ` [${s.status.replace(/_/g, " ")}]` : ""}
                </option>
              ))}
            </select>
            {errors.sku_code && <p className="text-xs text-destructive">{errors.sku_code}</p>}
            {skuNotActive && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This SKU is currently{" "}
                <strong className="capitalize">{selectedSku!.status.replace(/_/g, " ")}</strong>.
                A PO can only be raised against an <strong>active</strong> SKU.
              </div>
            )}
          </div>

          {/* Manufacturer */}
          <div className="grid gap-1.5">
            <Label htmlFor="apo-mfg">Manufacturer <span className="text-destructive">*</span></Label>
            <select id="apo-mfg" value={form.mfg_id} onChange={(e) => set("mfg_id", e.target.value)} className={selectCls}>
              <option value="">— Select MFG —</option>
              {mfgOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
            {errors.mfg_id && <p className="text-xs text-destructive">{errors.mfg_id}</p>}
          </div>

          {/* Quantity + Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="apo-qty">PO Quantity <span className="text-destructive">*</span></Label>
              <Input
                id="apo-qty" type="number" min={0} placeholder="e.g. 5000"
                value={form.qty} onChange={(e) => set("qty", e.target.value)}
              />
              {errors.qty && <p className="text-xs text-destructive">{errors.qty}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="apo-rate">Rate per Unit (₹)</Label>
              <div id="apo-rate" className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                {rateLoading ? "Calculating…" : computedRate != null ? `₹${computedRate.toFixed(2)}` : "—"}
              </div>
              {/* <p className="text-[11px] text-muted-foreground">Auto-calculated from Manufacturing → Final Costing.</p> */}
            </div>
          </div>
          {rateError && !rateLoading && (
            <p className="text-xs text-destructive -mt-2">{rateError}</p>
          )}

          {/* Expected Dispatch — no backdating */}
          <div className="grid gap-1.5">
            <Label htmlFor="apo-dispatch">Expected Dispatch <span className="text-destructive">*</span></Label>
            <Input
              id="apo-dispatch" type="date"
              min={today}
              value={form.expected_on} onChange={(e) => set("expected_on", e.target.value)}
            />
            {errors.expected_on && <p className="text-xs text-destructive">{errors.expected_on}</p>}
          </div>

          {/* Destination — defaults to Mother Warehouse */}
          <div className="grid gap-1.5">
            <Label htmlFor="apo-dest">Destination Warehouse</Label>
            <select id="apo-dest" value={form.destination} onChange={(e) => set("destination", e.target.value)} className={selectCls}>
              <option value="">— Select Warehouse (optional) —</option>
              {warehouseOptions.map((w) => (
                <option key={w.id} value={w.name}>
                  {w.name}{w.zone ? ` — ${w.zone}` : ""} ({w.type})
                </option>
              ))}
            </select>
          </div>

          {/* Reason — mandatory only for Impromptu */}
          <div className="grid gap-1.5">
            <Label htmlFor="apo-reason">
              Reason / Notes
              {poType === "impromptu" && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              id="apo-reason" rows={2}
              placeholder="Why is this PO being raised? Any special instructions…"
              value={form.reason} onChange={(e) => set("reason", e.target.value)}
            />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
          </div>

          {apiError && <p className="text-sm text-destructive">{apiError}</p>}
        </div>

        <DialogFooter className="flex-row items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={poType === "impromptu"}
              onChange={(e) => {
                setPoType(e.target.checked ? "impromptu" : "normal")
                setErrors({})
              }}
              className="h-3.5 w-3.5 rounded accent-amber-500"
            />
            <span className="text-xs text-muted-foreground">
              Impromptu{poType === "impromptu" && <span className="ml-1 font-mono opacity-60">(IMP-)</span>}
            </span>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || skuNotActive}>
              {submitting
                ? (poType === "normal" ? "Raising…" : "Submitting…")
                : (poType === "normal" ? "Raise PO" : "Submit for Approval")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
