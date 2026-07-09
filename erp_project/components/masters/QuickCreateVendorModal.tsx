"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Vendor } from "@/types/masters"
import { useToast } from "@/components/ui/toast"

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
const labelCls = "block text-xs font-medium mb-1"

type Props = {
  open: boolean
  defaultType?: "rm" | "pm" | "both"
  onClose: () => void
  onSuccess: (vendor: Vendor) => void
}

export function QuickCreateVendorModal({
  open,
  defaultType = "both",
  onClose,
  onSuccess,
}: Props) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: defaultType as string,
    location: "",
    zone: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setForm({ code: "", name: "", type: defaultType, location: "", zone: "" })
    setError(null)
    setLoading(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    if (!form.code.trim() || !form.name.trim() || !form.type) {
      setError("Code, Name and Type are required.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/masters/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) throw new Error("Vendor code already exists.")
        throw new Error(data.error || "Failed to create vendor.")
      }
      const newVendor: Vendor = {
        vendor_id: data.id,
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        location: form.location.trim() || null,
        zone: form.zone.trim() || null,
        registered_name: null,
        status: "active",
        gst_number: null,
        bank_name: null,
        ifsc_number: null,
        account_number: null,
        gst_certificate_key: null,
        cancelled_cheque_key: null,
        pan_card_key: null,
        misc_document_key: null,
      }
      toast({ title: "Vendor created", description: newVendor.name, variant: "success" })
      onSuccess(newVendor)
      reset()
    } catch (e: any) {
      setError(e.message || "An error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Vendor</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              Code <span className="text-destructive">*</span>
            </label>
            <input
              className={inputCls}
              placeholder="e.g. VND-001"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>
              Name <span className="text-destructive">*</span>
            </label>
            <input
              className={inputCls}
              placeholder="Vendor name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>
              Type <span className="text-destructive">*</span>
            </label>
            <select
              className={inputCls}
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            >
              <option value="rm">Raw Material</option>
              <option value="pm">Packing Material</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Zone</label>
            <input
              className={inputCls}
              placeholder="e.g. West"
              value={form.zone}
              onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Location</label>
            <input
              className={inputCls}
              placeholder="City / State"
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating…" : "Create Vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
