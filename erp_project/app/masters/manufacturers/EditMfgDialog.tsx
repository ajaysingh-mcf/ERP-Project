"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Mfg } from "@/types/masters"

export function EditMfgDialog({
  mfg,
  onSuccess,
  onClose,
}: {
  mfg: Mfg | null
  onSuccess: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: mfg?.name ?? "",
    location: mfg?.location ?? "",
    gst_number: mfg?.gst_number ?? "",
    status: mfg?.status ?? "active",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mfg) {
      setForm({
        name: mfg.name ?? "",
        location: mfg.location ?? "",
        gst_number: mfg.gst_number ?? "",
        status: mfg.status ?? "active",
      })
    }
  }, [mfg])

  if (!mfg) return null

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/masters/manufacturers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", mfg_id: mfg!.mfg_id, ...form }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Failed to save"); return }
      onSuccess()
      onClose()
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Manufacturer — {mfg.code}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>GST Number</Label>
            <Input value={form.gst_number} onChange={(e) => set("gst_number", e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Status</Label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}