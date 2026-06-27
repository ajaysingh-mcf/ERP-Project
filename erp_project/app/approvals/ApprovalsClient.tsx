"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronDown, ChevronRight, Check, X, Clock, ShieldCheck,
  FileText, ExternalLink, Loader2 as SpinIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

// ── Types ────────────────────────────────────────────────────────────────────

type ApprovalItem = {
  field_name: string
  old_value:  string
  new_value:  string
}

type Approval = {
  id:                     number
  module:                 string
  entity_id:              number
  raised_on:              string
  raised_by_name:         string
  items:                  ApprovalItem[]
  entity_code:            string | null
  entity_name:            string | null
  entity_secondary_code:  string | null
  entity_secondary_name:  string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE_LABEL: Record<string, string> = {
  SKU:     "SKU",
  RM_RATE: "RM Rate (MFG)",
  PM_RATE: "PM Rate (MFG)",
  RM_VRM:  "RM Rate (Vendor)",
  PM_VRM:  "PM Rate (Vendor)",
  RM_MAT:  "Raw Material",
  PM_MAT:  "Packing Material",
  VENDOR:  "Vendor",
  MFG:     "Manufacturer",
  PO:      "Impromptu PO",
  PO_BULK: "Bulk PO Upload",
}

const MODULE_COLOR: Record<string, string> = {
  SKU:     "bg-blue-50 text-blue-700 border-blue-200",
  RM_RATE: "bg-purple-50 text-purple-700 border-purple-200",
  PM_RATE: "bg-orange-50 text-orange-700 border-orange-200",
  RM_VRM:  "bg-green-50 text-green-700 border-green-200",
  PM_VRM:  "bg-teal-50 text-teal-700 border-teal-200",
  RM_MAT:  "bg-rose-50 text-rose-700 border-rose-200",
  PM_MAT:  "bg-violet-50 text-violet-700 border-violet-200",
  VENDOR:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  MFG:     "bg-amber-50 text-amber-700 border-amber-200",
  PO:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  PO_BULK: "bg-cyan-50 text-cyan-700 border-cyan-200",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// ── DiffSection ───────────────────────────────────────────────────────────────

function CsvFileCard({
  approvalId, items, openingFileFor, onOpen,
}: {
  approvalId:    number
  items:         ApprovalItem[]
  openingFileFor: number | null
  onOpen:        (approvalId: number, s3Key: string) => void
}) {
  const filename = items.find(i => i.field_name === "filename")?.new_value ?? ""
  const s3Key    = items.find(i => i.field_name === "s3_key")?.new_value    ?? ""
  const busy     = openingFileFor === approvalId

  return (
    <div className="rounded-lg border border-border bg-background p-3.5 flex items-center gap-3">
      <div className="rounded-full bg-cyan-50 p-2 shrink-0">
        <FileText className="h-4 w-4 text-cyan-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{filename || "bulk-upload.csv"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">CSV bulk PO upload</p>
      </div>
      {s3Key && (
        <button
          onClick={() => onOpen(approvalId, s3Key)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-100 transition-colors disabled:opacity-50 shrink-0"
        >
          {busy
            ? <><SpinIcon className="h-3.5 w-3.5 animate-spin" /> Opening…</>
            : <><ExternalLink className="h-3.5 w-3.5" /> Open File</>
          }
        </button>
      )}
    </div>
  )
}

function FieldDiffGrid({ items }: { items: ApprovalItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.field_name} className="rounded-md border border-border bg-background p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {item.field_name.replace(/_/g, " ")}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="flex-1 min-w-0 rounded bg-red-50 border border-red-100 px-2 py-1 text-xs text-red-700 font-medium truncate">
              {item.old_value || "—"}
            </span>
            <span className="shrink-0 text-muted-foreground font-mono text-[11px]">→</span>
            <span className="flex-1 min-w-0 rounded bg-emerald-50 border border-emerald-100 px-2 py-1 text-xs text-emerald-700 font-medium truncate">
              {item.new_value || "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ApprovalCard ──────────────────────────────────────────────────────────────

function ApprovalCard({
  approval, isExpanded, isApprover, loading, error, openingFileFor,
  onToggle, onApprove, onReject, onOpenCsvFile,
}: {
  approval:       Approval
  isExpanded:     boolean
  isApprover:     boolean
  loading:        boolean
  error?:         string
  openingFileFor: number | null
  onToggle:       () => void
  onApprove:      () => void
  onReject:       () => void
  onOpenCsvFile:  (approvalId: number, s3Key: string) => void
}) {
  const moduleColor = MODULE_COLOR[approval.module] ?? "bg-slate-50 text-slate-700 border-slate-200"
  const isBulk      = approval.module === "PO_BULK"

  return (
    <Card className={`overflow-hidden transition-all ${isExpanded ? "ring-1 ring-primary/20 shadow-sm" : ""}`}>

      {/* Clickable header */}
      <button className="w-full text-left px-5 py-4 hover:bg-muted/30 transition-colors" onClick={onToggle}>
        <div className="flex items-start gap-4">

          {/* Left: module badge + entity info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${moduleColor}`}>
                {MODULE_LABEL[approval.module] ?? approval.module}
              </span>
              {isBulk ? (
                <Badge variant="secondary" className="gap-1 text-[10px] h-4">
                  <FileText className="h-2.5 w-2.5" /> 1 CSV file
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] h-4">
                  {approval.items.length} field{approval.items.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <EntityInfo approval={approval} />
          </div>

          {/* Right: submitter + timestamp + chevron */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <div className="flex items-center justify-end gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground select-none">
                  {getInitials(approval.raised_by_name)}
                </div>
                <span className="text-sm font-medium">{approval.raised_by_name}</span>
              </div>
              <div className="flex items-center justify-end gap-1 mt-0.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                {fmtDate(approval.raised_on)}
              </div>
            </div>
            {isExpanded
              ? <ChevronDown  className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            }
          </div>
        </div>
      </button>

      {/* Expanded diff */}
      {isExpanded && (
        <div className="border-t border-border bg-muted/20 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {isBulk ? "Uploaded File" : "Field Changes"}
          </p>
          {isBulk ? (
            <CsvFileCard
              approvalId={approval.id}
              items={approval.items}
              openingFileFor={openingFileFor}
              onOpen={onOpenCsvFile}
            />
          ) : (
            <FieldDiffGrid items={approval.items} />
          )}
        </div>
      )}

      {/* Actions footer */}
      {isApprover && (
        <div
          className={`flex items-center justify-between px-5 py-2.5 border-t ${isExpanded ? "border-border bg-muted/10" : "border-border/40"}`}
          onClick={e => e.stopPropagation()}
        >
          <div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline" disabled={loading}
              className="h-7 gap-1 text-red-700 border-red-200 hover:bg-red-50"
              onClick={onReject}
            >
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button
              size="sm" disabled={loading}
              className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              onClick={onApprove}
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function EntityInfo({ approval }: { approval: Approval }) {
  const { entity_code, entity_name, entity_secondary_code, entity_secondary_name, entity_id } = approval

  if (!entity_code && !entity_name) {
    return <span className="font-mono text-xs text-muted-foreground">#{entity_id}</span>
  }

  return (
    <div className="space-y-0.5">
      <div>
        {entity_code && (
          <span className="font-mono text-sm font-bold tracking-tight">{entity_code}</span>
        )}
        {entity_name && (
          <span className={`text-sm ${entity_code ? "ml-2 text-muted-foreground" : "font-medium"}`}>
            {entity_name}
          </span>
        )}
      </div>
      {(entity_secondary_code || entity_secondary_name) && (
        <div>
          {entity_secondary_code && (
            <span className="font-mono text-xs font-semibold text-muted-foreground">{entity_secondary_code}</span>
          )}
          {entity_secondary_name && (
            <span className={`text-xs text-muted-foreground ${entity_secondary_code ? "ml-1.5" : ""}`}>
              {entity_secondary_name}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── RejectDialog ──────────────────────────────────────────────────────────────

function RejectDialog({
  open, loading, onClose, onConfirm,
}: {
  open:      boolean
  loading:   boolean
  onClose:   () => void
  onConfirm: (remarks: string) => void
}) {
  const [remarks, setRemarks]   = useState("")
  const [error,   setError]     = useState("")

  function handleConfirm() {
    if (!remarks.trim()) { setError("Remarks are required before rejecting."); return }
    onConfirm(remarks.trim())
  }

  function handleClose() {
    setRemarks(""); setError(""); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Edit</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <p className="text-sm text-muted-foreground">
            The record will revert to <strong>Draft</strong> so the requester can modify and resubmit.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="remarks">Remarks <span className="text-destructive">*</span></Label>
            <Textarea
              id="remarks"
              placeholder="Explain why this edit is being rejected…"
              value={remarks}
              onChange={(e) => { setRemarks(e.target.value); setError("") }}
              rows={3}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? "Rejecting…" : "Confirm Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── ApprovalsClient (main) ────────────────────────────────────────────────────

export default function ApprovalsClient({
  approvals: initialApprovals,
  isApprover,
}: {
  approvals:  Approval[]
  isApprover: boolean
}) {
  const router = useRouter()

  const [approvals,       setApprovals]       = useState<Approval[]>(initialApprovals)
  const [expanded,        setExpanded]        = useState<number | null>(null)
  const [rejectTarget,    setRejectTarget]    = useState<Approval | null>(null)
  const [loading,         setLoading]         = useState(false)
  const [actionError,     setActionError]     = useState<Record<number, string>>({})
  const [openingFileFor,  setOpeningFileFor]  = useState<number | null>(null)

  function clearError(id: number) {
    setActionError(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function toggleExpand(id: number) {
    setExpanded(prev => prev === id ? null : id)
    clearError(id)
  }

  async function openCsvFile(approvalId: number, s3Key: string) {
    setOpeningFileFor(approvalId)
    try {
      const res  = await fetch(`/api/files/presign?key=${encodeURIComponent(s3Key)}&view=1`)
      const data = await res.json()
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer")
    } finally {
      setOpeningFileFor(null)
    }
  }

  async function handleApprove(approval: Approval) {
    setLoading(true); clearError(approval.id)
    try {
      const res  = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      const data = await res.json()
      if (!res.ok) { setActionError(prev => ({ ...prev, [approval.id]: data.error ?? "Failed to approve" })); return }
      setApprovals(prev => prev.filter(a => a.id !== approval.id))
      setExpanded(null)
      router.refresh()
    } catch {
      setActionError(prev => ({ ...prev, [approval.id]: "Network error" }))
    } finally {
      setLoading(false)
    }
  }

  async function handleReject(approval: Approval, remarks: string) {
    setLoading(true)
    try {
      const res  = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", remarks }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to reject")
      setApprovals(prev => prev.filter(a => a.id !== approval.id))
      setExpanded(null)
      setRejectTarget(null)
      router.refresh()
    } catch (err: any) {
      throw err
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5 px-6 pt-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">Pending Approvals</h1>
            {approvals.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">
                {approvals.length}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {approvals.length === 0
              ? "All caught up — no pending edits."
              : "Master-data changes awaiting your review"}
          </p>
        </div>
        {!isApprover && (
          <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            View only — admin or manager role required
          </div>
        )}
      </div>

      {/* Empty state */}
      {approvals.length === 0 ? (
        <Card className="mx-6 mb-6">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="rounded-full bg-emerald-50 p-4">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-medium">No pending approvals</p>
            <p className="text-sm text-muted-foreground">All edits have been reviewed.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 px-4 pb-6">
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              isExpanded={expanded === approval.id}
              isApprover={isApprover}
              loading={loading}
              error={actionError[approval.id]}
              openingFileFor={openingFileFor}
              onToggle={() => toggleExpand(approval.id)}
              onApprove={() => handleApprove(approval)}
              onReject={() => setRejectTarget(approval)}
              onOpenCsvFile={openCsvFile}
            />
          ))}
        </div>
      )}

      {/* Reject dialog */}
      <RejectDialog
        open={rejectTarget !== null}
        loading={loading}
        onClose={() => setRejectTarget(null)}
        onConfirm={(remarks) => rejectTarget && handleReject(rejectTarget, remarks)}
      />
    </>
  )
}
