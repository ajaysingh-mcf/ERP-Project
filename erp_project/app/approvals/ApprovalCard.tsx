"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Check, X, Clock, FileText, ExternalLink, Loader2 as SpinIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Approval } from "./approvals-types"
import { MODULE_LABEL, MODULE_COLOR, getInitials, fmtDate } from "./approvals-types"

// ── CsvFileCard ───────────────────────────────────────────────────────────────

function CsvFileCard({ approvalId, items, openingFileFor, onOpen }: {
  approvalId:    number
  items:         Approval["items"]
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

// ── Doc key fields — rendered as view buttons instead of raw S3 keys ──────────

const DOC_FIELDS = new Set([
  "gst_certificate_key", "cancelled_cheque_key", "pan_card_key", "misc_document_key",
])

function DocViewButton({ s3Key, variant }: { s3Key: string; variant: "old" | "new" }) {
  const [opening, setOpening] = useState(false)
  const [failed,  setFailed]  = useState(false)

  async function handleView() {
    setOpening(true)
    setFailed(false)
    try {
      const res  = await fetch(`/api/files/presign?key=${encodeURIComponent(s3Key)}`)
      const data = await res.json()
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer")
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setOpening(false)
    }
  }

  const filename = s3Key.split("/").pop() ?? s3Key
  const isOld    = variant === "old"

  return (
    <button
      onClick={handleView}
      disabled={opening}
      title={s3Key}
      className={[
        "flex-1 min-w-0 flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium transition-colors",
        isOld
          ? "bg-red-50 border-red-100 text-red-700 hover:bg-red-100"
          : "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100",
        "disabled:opacity-60",
      ].join(" ")}
    >
      {opening
        ? <SpinIcon className="h-3 w-3 shrink-0 animate-spin" />
        : <ExternalLink className="h-3 w-3 shrink-0" />
      }
      <span className="truncate">{failed ? "Error opening" : filename}</span>
    </button>
  )
}

// ── FieldDiffGrid ─────────────────────────────────────────────────────────────

function FieldDiffGrid({ items }: { items: Approval["items"] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((item) => {
        const isDoc  = DOC_FIELDS.has(item.field_name)
        const label  = item.field_name
          .replace(/_key$/, "")
          .replace(/_/g, " ")

        return (
          <div key={item.field_name} className="rounded-md border border-border bg-background p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {label}
            </p>
            <div className="flex items-center gap-1.5">
              {isDoc && item.old_value ? (
                <DocViewButton s3Key={item.old_value} variant="old" />
              ) : (
                <span className="flex-1 min-w-0 rounded bg-red-50 border border-red-100 px-2 py-1 text-xs text-red-700 font-medium truncate">
                  {item.old_value || "—"}
                </span>
              )}
              <span className="shrink-0 text-muted-foreground font-mono text-[11px]">→</span>
              {isDoc && item.new_value ? (
                <DocViewButton s3Key={item.new_value} variant="new" />
              ) : (
                <span className="flex-1 min-w-0 rounded bg-emerald-50 border border-emerald-100 px-2 py-1 text-xs text-emerald-700 font-medium truncate">
                  {item.new_value || "—"}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── BomLineDiffTable — readable rendering of a BOM's line:<type>:<id>:<field>
//    flat approval_items (see lib/approvals/module-handlers.ts bomHandler for
//    the write side). Groups items by material, one row per line, instead of
//    ~40 raw flat FieldDiffGrid cells. ─────────────────────────────────────────

type BomLineRowDiff = {
  mtrlType: "rm" | "pm"
  mtrlId: string
  removed: boolean
  fields: Record<string, { old: string; new: string }>
}

function parseBomApprovalItems(items: Approval["items"]) {
  const modeItem = items.find((i) => i.field_name === "__mode__")
  const mode = modeItem?.new_value === "update-existing" ? "update-existing" : "new-version"

  const lineMap = new Map<string, BomLineRowDiff>()
  for (const it of items) {
    const m = it.field_name.match(/^line:(rm|pm):(\d+):(.+)$/)
    if (!m) continue
    const [, mtrlType, mtrlId, field] = m
    const key = `${mtrlType}:${mtrlId}`
    if (!lineMap.has(key)) {
      lineMap.set(key, { mtrlType: mtrlType as "rm" | "pm", mtrlId, removed: false, fields: {} })
    }
    const entry = lineMap.get(key)!
    if (field === "__removed__") entry.removed = true
    else entry.fields[field] = { old: it.old_value, new: it.new_value }
  }
  return { mode, lines: [...lineMap.values()] }
}

function BomLineDiffTable({ items }: { items: Approval["items"] }) {
  const { mode, lines } = parseBomApprovalItems(items)
  const rmLines = lines.filter((l) => l.mtrlType === "rm")
  const pmLines = lines.filter((l) => l.mtrlType === "pm")

  function renderLine(line: BomLineRowDiff) {
    if (line.removed) {
      return (
        <div key={`${line.mtrlType}:${line.mtrlId}`} className="rounded-md border border-border bg-background p-3 opacity-60">
          <p className="text-xs line-through text-muted-foreground">
            Line removed: {line.mtrlType.toUpperCase()} #{line.mtrlId}
          </p>
        </div>
      )
    }
    return (
      <div key={`${line.mtrlType}:${line.mtrlId}`} className="rounded-md border border-border bg-background p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {line.mtrlType} #{line.mtrlId}
        </p>
        <div className="space-y-1">
          {Object.entries(line.fields).map(([field, { old: oldVal, new: newVal }]) => (
            <div key={field} className="flex items-center gap-1.5 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground capitalize">{field.replace(/_/g, " ")}</span>
              <span className="flex-1 min-w-0 rounded bg-red-50 border border-red-100 px-2 py-0.5 text-red-700 font-medium truncate">
                {oldVal || "—"}
              </span>
              <span className="shrink-0 text-muted-foreground font-mono">→</span>
              <span className="flex-1 min-w-0 rounded bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-emerald-700 font-medium truncate">
                {newVal || "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Badge variant="secondary" className="text-[10px]">
        {mode === "new-version" ? "New Version" : "Update Existing"}
      </Badge>
      {rmLines.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            RM ({rmLines.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{rmLines.map(renderLine)}</div>
        </div>
      )}
      {pmLines.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            PM ({pmLines.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{pmLines.map(renderLine)}</div>
        </div>
      )}
    </div>
  )
}

// ── EntityInfo ────────────────────────────────────────────────────────────────

function EntityInfo({ approval }: { approval: Approval }) {
  const { entity_code, entity_name, entity_secondary_code, entity_secondary_name, entity_id } = approval

  if (!entity_code && !entity_name) {
    return <span className="font-mono text-xs text-muted-foreground">#{entity_id}</span>
  }

  return (
    <div className="space-y-0.5">
      <div>
        {entity_code && <span className="font-mono text-sm font-bold tracking-tight">{entity_code}</span>}
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

// ── ApprovalCard ──────────────────────────────────────────────────────────────

export default function ApprovalCard({
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
  const isBom       = approval.module === "BOM"

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden transition-all ${isExpanded ? "ring-1 ring-primary/20 shadow-sm" : ""}`}>

      {/* Clickable header */}
      <button className="w-full text-left px-5 py-4 hover:bg-muted/30 transition-colors" onClick={onToggle}>
        <div className="flex items-start gap-4">
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
            {isBulk ? "Uploaded File" : isBom ? "Formulation Changes" : "Field Changes"}
          </p>
          {isBulk ? (
            <CsvFileCard
              approvalId={approval.id}
              items={approval.items}
              openingFileFor={openingFileFor}
              onOpen={onOpenCsvFile}
            />
          ) : isBom ? (
            <BomLineDiffTable items={approval.items} />
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
          <div>{error && <p className="text-xs text-destructive">{error}</p>}</div>
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
    </div>
  )
}
