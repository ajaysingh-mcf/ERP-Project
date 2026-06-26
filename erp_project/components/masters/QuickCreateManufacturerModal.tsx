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
import type { Mfg } from "@/types/masters"
import { useToast } from "@/components/ui/toast"

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
const labelCls = "block text-xs font-medium mb-1"

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: (mfg: Mfg) => void
}

const DEFAULT_FORM = { code: "", name: "", location: "", gst_number: "", status: "active" }

export function QuickCreateManufacturerModal({ open, onClose, onSuccess }: Props) {
  const { toast } = useToast()
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setForm(DEFAULT_FORM)
    setError(null)
    setLoading(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and Name are required.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/masters/manufacturers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          code: form.code.trim(),
          name: form.name.trim(),
          location: form.location.trim() || null,
          gst_number: form.gst_number.trim() || null,
          status: form.status,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) throw new Error("Manufacturer code already exists.")
        throw new Error(data.error || "Failed to create manufacturer.")
      }
      const newMfg: Mfg = {
        id: null,
        mfg_id: data.id,
        code: form.code.trim(),
        name: form.name.trim(),
        location: form.location.trim() || null,
        gst_number: form.gst_number.trim() || null,
        status: form.status,
        registered_name: null,
        zone: null,
        bank_name: null,
        ifsc_number: null,
        account_number: null,
        email: null,
      }
      toast({ title: "Manufacturer created", description: newMfg.name, variant: "success" })
      onSuccess(newMfg)
      reset()
    } catch (e: any) {
      setError(e.message || "An error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create New Manufacturer</DialogTitle>
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
              placeholder="e.g. MFG-001"
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
              placeholder="Manufacturer name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Location</label>
            <input
              className={inputCls}
              placeholder="e.g. Mumbai, Maharashtra"
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>GST Number</label>
            <input
              className={inputCls}
              placeholder="27AAAAA0000A1Z5"
              value={form.gst_number}
              onChange={(e) => setForm((p) => ({ ...p, gst_number: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              className={inputCls}
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating…" : "Create Manufacturer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
