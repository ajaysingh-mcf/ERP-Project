"use client"

import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"
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

type AnyRow = Record<string, unknown>

export default function EditMaterialDialog({
  material,
  row,
  onClose,
  onSuccess,
}: {
  material: "rm" | "pm"
  row: AnyRow | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state — synced from `row` whenever the dialog opens.
  const [name, setName]         = useState("")
  const [make, setMake]         = useState("")
  const [inci, setInci]         = useState("")
  const [type, setType]         = useState("")
  const [uom, setUom]           = useState("")
  const [hsn, setHsn]           = useState("")
  const [status, setStatus]     = useState<"active" | "discontinued">("active")

  // Populate fields when a row is selected.
  useEffect(() => {
    if (!row) return
    setName(String(row.name ?? ""))
    setMake(String(row.make ?? ""))
    setInci(String(row.inci_name ?? ""))
    setType(String(row.type ?? ""))
    setUom(String(row.uom ?? ""))
    setHsn(String(row.hsn_code ?? ""))
    setStatus((row.status as "active" | "discontinued") ?? "active")
    setError(null)
  }, [row])

  async function handleSubmit() {
    if (!name.trim()) { setError("Name is required."); return }
    if (material === "rm" && !make.trim()) { setError("Make is required."); return }
    if (material === "rm" && !inci.trim()) { setError("INCI Name is required."); return }
    if (material === "pm" && !type.trim()) { setError("Type is required."); return }

    setLoading(true)
    setError(null)

    try {
      const payload =
        material === "rm"
          ? { material: "rm", id: row!.id, name: name.trim(), make: make.trim(), inci_name: inci.trim(), type: type.trim() || null, uom: uom.trim() || null, hsn_code: hsn.trim() || null, status }
          : { material: "pm", id: row!.id, name: name.trim(), type: type.trim(), uom: uom.trim() || null, hsn_code: hsn.trim() || null, status }

      const res = await fetch("/api/masters/material-master", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return }

      onClose()
      onSuccess()
    } catch {
      setError("Network error — please try again.")
    } finally {
      setLoading(false)
    }
  }

  const label = material === "rm" ? "Raw Material" : "Packing Material"
  const codeKey = material === "rm" ? "rm_code" : "pm_code"

  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {label}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5 py-2">
          {/* Code — read-only, shown for reference */}
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>
              {material === "rm" ? "RM Code" : "PM Code"}{" "}
              <span className="text-xs text-muted-foreground">(auto-generated)</span>
            </Label>
            <Input value={String(row?.[codeKey] ?? "—")} readOnly className="bg-muted text-muted-foreground" />
          </div>

          {/* Name */}
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="edit-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* RM-only: Make + INCI Name */}
          {material === "rm" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-make">
                  Make <span className="text-destructive">*</span>
                </Label>
                <Input id="edit-make" value={make} onChange={(e) => setMake(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-inci">
                  INCI Name <span className="text-destructive">*</span>
                </Label>
                <Input id="edit-inci" value={inci} onChange={(e) => setInci(e.target.value)} />
              </div>
            </>
          )}

          {/* Type — required for PM, optional for RM */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-type">
              Type{material === "pm" && <span className="text-destructive"> *</span>}
            </Label>
            <Input id="edit-type" value={type} onChange={(e) => setType(e.target.value)} />
          </div>

          {/* UOM */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-uom">UOM</Label>
            <Input id="edit-uom" placeholder="e.g. kg, pcs" value={uom} onChange={(e) => setUom(e.target.value)} />
          </div>

          {/* HSN Code */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-hsn">HSN Code</Label>
            <Input id="edit-hsn" placeholder="e.g. 29054500" value={hsn} onChange={(e) => setHsn(e.target.value)} />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "discontinued")}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="active">Active</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-destructive -mt-1">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Row-level trigger button ─────────────────────────────────────────────────

export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      title="Edit material"
    >
      <Pencil className="h-4 w-4" />
    </button>
  )
}
