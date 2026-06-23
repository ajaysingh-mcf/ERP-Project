"use client"

import { useState, Fragment } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, Check, X, Clock, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

type ApprovalItem = {
  field_name: string
  old_value: string
  new_value: string
}

type Approval = {
  id: number
  module: string
  entity_id: number
  raised_on: string
  raised_by_name: string
  items: ApprovalItem[]
}

const MODULE_LABEL: Record<string, string> = {
  SKU:     "SKU",
  RM_RATE: "RM Rate (MFG)",
  PM_RATE: "PM Rate (MFG)",
  RM_VRM:  "RM Rate (Vendor)",
  PM_VRM:  "PM Rate (Vendor)",
  RM_MAT:  "Raw Material",
  PM_MAT:  "Packing Material",
}

const MODULE_COLOR: Record<string, string> = {
  SKU:     "bg-blue-50 text-blue-700 border-blue-200",
  RM_RATE: "bg-purple-50 text-purple-700 border-purple-200",
  PM_RATE: "bg-orange-50 text-orange-700 border-orange-200",
  RM_VRM:  "bg-green-50 text-green-700 border-green-200",
  PM_VRM:  "bg-teal-50 text-teal-700 border-teal-200",
  RM_MAT:  "bg-rose-50 text-rose-700 border-rose-200",
  PM_MAT:  "bg-violet-50 text-violet-700 border-violet-200",
}

export default function ApprovalsClient({
  approvals: initialApprovals,
  isApprover,
}: {
  approvals: Approval[]
  isApprover: boolean
}) {
  const router = useRouter()
  const [approvals, setApprovals]       = useState<Approval[]>(initialApprovals)
  const [expanded, setExpanded]         = useState<number | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Approval | null>(null)
  const [remarks, setRemarks]           = useState("")
  const [remarksError, setRemarksError] = useState("")
  const [loading, setLoading]           = useState(false)
  const [actionError, setActionError]   = useState("")

  function toggleExpand(id: number) {
    setExpanded((prev) => (prev === id ? null : id))
    setActionError("")
  }

  async function handleApprove(approval: Approval) {
    setLoading(true)
    setActionError("")
    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      const data = await res.json()
      if (!res.ok) { setActionError(data.error ?? "Failed to approve"); return }
      setApprovals((prev) => prev.filter((a) => a.id !== approval.id))
      setExpanded(null)
      router.refresh()
    } catch {
      setActionError("Network error")
    } finally {
      setLoading(false)
    }
  }

  function openRejectDialog(approval: Approval) {
    setRejectTarget(approval)
    setRemarks("")
    setRemarksError("")
    setActionError("")
  }

  async function handleReject() {
    if (!rejectTarget) return
    if (!remarks.trim()) { setRemarksError("Remarks are required before rejecting."); return }
    setLoading(true)
    setActionError("")
    try {
      const res = await fetch(`/api/approvals/${rejectTarget.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", remarks: remarks.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setActionError(data.error ?? "Failed to reject"); return }
      setApprovals((prev) => prev.filter((a) => a.id !== rejectTarget.id))
      setExpanded(null)
      setRejectTarget(null)
      router.refresh()
    } catch {
      setActionError("Network error")
    } finally {
      setLoading(false)
    }
  }

  const colSpan = isApprover ? 6 : 5

  return (
    <>
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6 p-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {approvals.length === 0
              ? "All caught up — no pending edits."
              : `${approvals.length} edit${approvals.length !== 1 ? "s" : ""} awaiting review`}
          </p>
        </div>
        {!isApprover && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            View only — admin or manager role required to approve
          </div>
        )}
      </div>

      {/* ── Empty state ── */}
      {approvals.length === 0 ? (
        <Card className="p-3">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="rounded-full bg-emerald-50 p-4">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-medium">No pending approvals</p>
            <p className="text-sm text-muted-foreground">All master-table edits have been reviewed.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">

              {/* ── Table head ── */}
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Module
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Submitted By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Submitted On
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Changes
                  </th>
                  {isApprover && (
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {approvals.map((approval) => {
                  const isExpanded  = expanded === approval.id
                  const moduleColor = MODULE_COLOR[approval.module] ?? "bg-slate-50 text-slate-700 border-slate-200"

                  return (
                    <Fragment key={approval.id}>

                      {/* ── Summary row ── */}
                      <tr
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? "bg-primary/5" : "hover:bg-muted/40"
                        }`}
                        onClick={() => toggleExpand(approval.id)}
                      >
                        {/* Expand icon */}
                        <td className="w-10 px-4 py-4 text-muted-foreground">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </td>

                        {/* Module */}
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${moduleColor}`}>
                            {MODULE_LABEL[approval.module] ?? approval.module}
                          </span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            #{approval.entity_id}
                          </span>
                        </td>

                        {/* Submitted by */}
                        <td className="px-4 py-4 font-medium">
                          {approval.raised_by_name}
                        </td>

                        {/* Submitted on */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {new Date(approval.raised_on).toLocaleString("en-IN", {
                              day: "2-digit", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </div>
                        </td>

                        {/* Changes */}
                        <td className="px-4 py-4">
                          <Badge variant="secondary">
                            {approval.items.length} field{approval.items.length !== 1 ? "s" : ""}
                          </Badge>
                        </td>

                        {/* Actions (visible on row) */}
                        {isApprover && (
                          <td
                            className="px-4 py-4 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-red-700 border-red-200 hover:bg-red-50"
                                disabled={loading}
                                onClick={() => openRejectDialog(approval)}
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                                disabled={loading}
                                onClick={() => handleApprove(approval)}
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* ── Expanded diff row ── */}
                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={colSpan} className="px-6 py-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                              Field Changes
                            </p>

                            <div className="rounded-lg border border-border overflow-hidden">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-muted/50 border-b border-border">
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-1/4">Field</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[37.5%]">Old Value</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[37.5%]">New Value</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border bg-background">
                                  {approval.items.map((item) => (
                                    <tr key={item.field_name}>
                                      <td className="px-4 py-3 font-mono text-xs font-medium capitalize text-foreground">
                                        {item.field_name.replace(/_/g, " ")}
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="inline-flex rounded bg-red-50 border border-red-100 px-2 py-0.5 text-xs text-red-700 font-medium">
                                          {item.old_value || "—"}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="inline-flex rounded bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-xs text-emerald-700 font-medium">
                                          {item.new_value || "—"}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {actionError && (
                              <p className="mt-3 text-sm text-destructive">{actionError}</p>
                            )}
                          </td>
                        </tr>
                      )}

                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Reject dialog ── */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => { if (!open && !loading) setRejectTarget(null) }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Edit</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              The record will revert to <strong>Draft</strong> so the requester can modify and resubmit.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="remarks">
                Remarks <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="remarks"
                placeholder="Explain why this edit is being rejected…"
                value={remarks}
                onChange={(e) => { setRemarks(e.target.value); setRemarksError("") }}
                rows={3}
              />
              {remarksError && (
                <p className="text-xs text-destructive">{remarksError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>
              {loading ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
