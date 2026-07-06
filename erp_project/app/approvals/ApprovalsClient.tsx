"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ShieldCheck, History } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Approval } from "./approvals-types"
import ApprovalCard, { type MaterialMap } from "./ApprovalCard"
import RejectDialog from "./RejectDialog"

export default function ApprovalsClient({
  approvals: initialApprovals,
  isApprover,
  materialMap,
}: {
  approvals:   Approval[]
  isApprover:  boolean
  materialMap: MaterialMap
}) {
  const router = useRouter()

  const [approvals,      setApprovals]      = useState<Approval[]>(initialApprovals)
  const [expanded,       setExpanded]       = useState<number | null>(null)
  const [rejectTarget,   setRejectTarget]   = useState<Approval | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [actionError,    setActionError]    = useState<Record<number, string>>({})
  const [openingFileFor, setOpeningFileFor] = useState<number | null>(null)

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
        <div className="flex items-center gap-2.5">
          {!isApprover && (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              View only — admin or manager role required
            </div>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push("/approvals/history")}>
            <History className="h-3.5 w-3.5" />
            View History
          </Button>
        </div>
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
              materialMap={materialMap}
            />
          ))}
        </div>
      )}

      <RejectDialog
        open={rejectTarget !== null}
        loading={loading}
        onClose={() => setRejectTarget(null)}
        onConfirm={(remarks) => rejectTarget && handleReject(rejectTarget, remarks)}
      />
    </>
  )
}
