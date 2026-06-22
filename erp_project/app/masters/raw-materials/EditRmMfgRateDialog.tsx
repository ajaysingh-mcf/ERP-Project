"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { RMByMfg } from "@/types/masters"

export function EditRmMfgRateDialog({
  row,
  onSuccess,
  onClose,
}: {
  row: RMByMfg | null
  onSuccess: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    curr_rate: "",
    uom: "",
    effective_from: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (row) {
      setForm({
        curr_rate: row.curr_rate ?? "",
        uom: row.uom ?? "",
        effective_from: toDateStr(row.effective_from),
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
          manufacturers: [{
            mfg_id: row?.mfg_id,
            mfg_code: row?.mfg_code,
            curr_rate: form.curr_rate,
            rate_uom: form.uom,
            effective_from: form.effective_from,
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
          <DialogTitle>Edit Manufacturer Rate — {row.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="text-xs text-muted-foreground">Manufacturer: {row.mfg_code}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Current Rate</Label>
              <Input type="number" value={form.curr_rate} onChange={(e) => set("curr_rate", e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>UOM</Label>
              <Input value={form.uom} onChange={(e) => set("uom", e.target.value)} />
            </div>
            <div className="grid gap-1 col-span-2">
              <Label>Effective From</Label>
              <Input type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} />
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
