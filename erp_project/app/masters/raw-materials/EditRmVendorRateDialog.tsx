"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { RM } from "@/types/masters"

export function EditRmVendorRateDialog({
  row,
  onSuccess,
  onClose,
}: {
  row: RM | null
  onSuccess: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    curr_rate: "",
    moq: "",
    uom: "",
    effective_from: "",
    effective_to: "",
    status: "active",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (row) {
      setForm({
        curr_rate: row.curr_rate ?? "",
        moq: row.moq ? String(row.moq) : "",
        uom: row.uom ?? "",
        effective_from: toDateStr(row.effective_from),
        effective_to: toDateStr(row.effective_to),
        status: row.status ?? "active",
      })
    }
  }, [row])

  if (!row) return null

  function toDateStr(val: unknown): string {
    if (!val) return ""
    if (val instanceof Date) return val.toISOString().slice(0, 10)
    return String(val).slice(0, 10)
  }

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/masters/raw-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-rates",
          name: row?.name,
          make: row?.make,
          inci_name: row?.inci_name,
          vendors: [{
            vendor_id: row?.vendor_id,
            vendor_code: row?.vendor_code,
            curr_rate: form.curr_rate,
            moq: form.moq,
            rate_uom: form.uom,
            effective_from: form.effective_from,
            effective_to: form.effective_to || null,
          }],
        }),
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
          <DialogTitle>Edit Vendor Rate — {row.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="text-xs text-muted-foreground">Vendor: {row.vendor_code}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Current Rate</Label>
              <Input type="number" value={form.curr_rate} onChange={(e) => set("curr_rate", e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>MOQ</Label>
              <Input type="number" value={form.moq} onChange={(e) => set("moq", e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>UOM</Label>
              <Input value={form.uom} onChange={(e) => set("uom", e.target.value)} />
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
                <option value="discontinued">Discontinued</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label>Effective From</Label>
              <Input type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>Effective To</Label>
              <Input type="date" value={form.effective_to} onChange={(e) => set("effective_to", e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
