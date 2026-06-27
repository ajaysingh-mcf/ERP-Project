"use client"

import { useEffect, useState } from "react"
import { Plus, Scissors, X } from "lucide-react"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { MfgOption, PoRow, SplitRow, WarehouseOption } from "./po-types"
import { fmtInt, num } from "./po-utils"

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-lg border p-3 text-center",
      highlight ? "border-amber-200 bg-amber-50" : "border-border bg-muted/30"
    )}>
      <div className="text-[11px] text-muted-foreground mb-0.5">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums", highlight && "text-amber-700")}>{value}</div>
    </div>
  )
}

function RemainingCard({ remaining, splitTotal, originalMfg }: {
  remaining: number
  splitTotal: number
  originalMfg: string
}) {
  const leftover = Math.max(0, remaining - splitTotal)
  const pct      = remaining > 0 ? Math.min(100, Math.round((splitTotal / remaining) * 100)) : 0
  const done     = splitTotal >= remaining && remaining > 0

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
        <div className="text-[11px] text-muted-foreground mb-0.5">Stays with original MFG</div>
        <div className="text-xl font-bold tabular-nums text-emerald-700">0</div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
          <div className="h-full w-full rounded-full bg-emerald-500" />
        </div>
        <div className="mt-1 text-[10px] font-medium text-emerald-600">Fully handed off</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
      <div className="text-[11px] text-muted-foreground mb-0.5">Stays with original MFG</div>
      <div className="text-xl font-bold tabular-nums text-blue-700">{leftover.toLocaleString()}</div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] font-medium text-blue-600 truncate" title={originalMfg}>
        {pct}% split off · {originalMfg}
      </div>
    </div>
  )
}

export default function SplitPODialog({
  open, onClose, po, warehouseOptions, mfgOptions, onSplit,
}: {
  open: boolean
  onClose: () => void
  po: PoRow | null
  warehouseOptions: WarehouseOption[]
  mfgOptions: MfgOption[]
  onSplit: () => void
}) {
  const defaultMfgId = po ? String(po.mfg_id) : ""

  const [rows, setRows]             = useState<SplitRow[]>([
    { mfg_id: defaultMfgId, destination: "", qty: "" },
    { mfg_id: defaultMfgId, destination: "", qty: "" },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError]     = useState("")

  useEffect(() => {
    if (open && po) {
      const id = String(po.mfg_id)
      setRows([
        { mfg_id: id, destination: "", qty: "" },
        { mfg_id: id, destination: "", qty: "" },
      ])
      setApiError("")
    }
  }, [open, po])

  if (!po) return null

  const total      = num(po.qty)
  const received   = num(po.received_qty)
  const remaining  = total - received
  const splitTotal = rows.reduce((s, r) => s + num(r.qty), 0)
  const overLimit  = splitTotal > remaining

  function setRow(i: number, field: keyof SplitRow, value: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
    setApiError("")
  }

  const addRow    = () => setRows((p) => [...p, { mfg_id: po ? String(po.mfg_id) : "", destination: "", qty: "" }])
  const removeRow = (i: number) => {
    if (rows.length <= 2) return
    setRows((p) => p.filter((_, idx) => idx !== i))
  }

  async function handleSplit() {
    if (!po) return
    if (rows.some((r) => !r.mfg_id)) {
      setApiError("Each row must have a manufacturer selected.")
      return
    }
    if (rows.some((r) => !r.qty || num(r.qty) <= 0)) {
      setApiError("Each row must have a quantity greater than 0.")
      return
    }
    if (overLimit) {
      setApiError(`Total (${splitTotal}) exceeds remaining qty (${remaining}).`)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splits: rows.map((r) => ({ mfg_id: Number(r.mfg_id), destination: r.destination, qty: Number(r.qty) })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setApiError(data.error ?? "Failed to split PO."); return }
      console.log(`[split dialog] success — split_type=${data.split_type} splits_created=${data.splits_created}`)
      onSplit()
      onClose()
    } catch {
      setApiError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const selectCls =
    "flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-muted-foreground" /> Split PO
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-0.5">
            <span className="font-mono font-semibold">{po.po_no}</span>
            {po.sku_name && <span className="ml-1.5">— {po.sku_name}</span>}
          </p>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total PO Qty"      value={fmtInt(total)} />
          <StatCard label="Already Received"  value={fmtInt(received)} />
          <RemainingCard remaining={remaining} splitTotal={splitTotal} originalMfg={po.mfg_name} />
        </div>

        {/* Split rows */}
        <div className="space-y-2 m-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs text-muted-foreground flex-shrink-0">{i + 1}</span>
              <select
                value={row.mfg_id}
                onChange={(e) => setRow(i, "mfg_id", e.target.value)}
                className={selectCls}
              >
                <option value="">— Manufacturer —</option>
                {mfgOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
              <select
                value={row.destination}
                onChange={(e) => setRow(i, "destination", e.target.value)}
                className={selectCls}
              >
                <option value="">— Destination —</option>
                {warehouseOptions.map((w) => (
                  <option key={w.id} value={w.name}>
                    {w.name}{w.zone ? ` — ${w.zone}` : ""} ({w.type})
                  </option>
                ))}
              </select>
              <Input
                type="number" min={1} placeholder="Qty"
                value={row.qty} onChange={(e) => setRow(i, "qty", e.target.value)}
                className="w-24"
              />
              {rows.length > 2 && (
                <button
                  onClick={() => removeRow(i)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  aria-label="Remove row"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer row: add + allocation counter */}
        <div className="flex items-center justify-between text-xs">
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add another split
          </button>
          <span className={cn("tabular-nums font-medium", overLimit ? "text-destructive" : "text-muted-foreground")}>
            Allocated: {fmtInt(splitTotal)} / {fmtInt(remaining)}
          </span>
        </div>

        {apiError && <p className="text-sm text-destructive">{apiError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSplit} disabled={submitting || overLimit}>
            {submitting ? "Splitting…" : `Confirm Split (${rows.length} POs)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
