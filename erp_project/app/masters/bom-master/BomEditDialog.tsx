"use client"

/**
 * Dedicated edit dialog for "Update Existing BOM" / the listing's per-row
 * Edit button — separated from the detail side panel (which was getting
 * cluttered mixing read-only detail + inline editing). Uses the table-form
 * BomLineEditorTable for a denser view of many RM/PM lines at once.
 */

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BomLineEditorTable } from "./BomLineEditorTable"
import type { BomLineRow, BomMaterialOption } from "./BomLineEditorGrid"

export function BomEditDialog({
  open,
  bomCode,
  rmRows,
  pmRows,
  onChangeRm,
  onChangePm,
  rmMaterials,
  pmMaterials,
  saveError,
  saving,
  onCancel,
  onSave,
}: {
  open: boolean
  bomCode: string | null
  rmRows: BomLineRow[]
  pmRows: BomLineRow[]
  onChangeRm: (rows: BomLineRow[]) => void
  onChangePm: (rows: BomLineRow[]) => void
  rmMaterials: BomMaterialOption[]
  pmMaterials: BomMaterialOption[]
  saveError: string | null
  saving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Edit BOM{bomCode ? <span className="font-mono text-muted-foreground ml-2">{bomCode}</span> : null}
          </DialogTitle>
        </DialogHeader>

        {saveError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive shrink-0">
            {saveError}
          </div>
        )}

        <div className="overflow-y-auto flex-1 min-h-0 py-1">
          <BomLineEditorTable
            rmRows={rmRows}
            pmRows={pmRows}
            onChangeRm={onChangeRm}
            onChangePm={onChangePm}
            rmMaterials={rmMaterials}
            pmMaterials={pmMaterials}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Submitting…" : "Save for Approval"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
