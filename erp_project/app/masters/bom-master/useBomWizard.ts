"use client"

/**
 * Owns all step/form state and submit handlers for BomCreationWizard:
 * SKU select -> existing-active-BOM check -> entry method (manual/CSV) ->
 * RM+PM line entry -> review & submit.
 *
 * "Update Existing BOM" (step 2, shown when the picked SKU already has an
 * active BOM) never submits from here — it closes the wizard and hands off
 * to the listing's edit-mode detail panel (onEditExisting), since editing in
 * place is a different surface (useBomDetailPanel.ts). This wizard otherwise
 * only ever submits mode:"new-version". Editing an existing BOM directly
 * (without going through "Create BOM" first) is also available via the
 * table's per-row Edit button, wired to the same onEditExisting.
 */

import { useState } from "react"
import { useToast } from "@/components/ui/toast"
import { isRmTotalValid } from "@/lib/validation/bom"
import { rmTotal, type BomLineRow, type BomMaterialOption } from "./BomLineEditorGrid"
import { parseBomCsv } from "./bom-csv"
import type { Sku } from "@/types/masters"

export type WizardStep = 1 | 2 | 3 | 4 | 5
export type EntryMethod = "manual" | "csv"

export function useBomWizard({
  skus,
  rmMaterials,
  pmMaterials,
  onSuccess,
  onEditExisting,
}: {
  skus: Sku[]
  rmMaterials: BomMaterialOption[]
  pmMaterials: BomMaterialOption[]
  onSuccess: () => void
  onEditExisting: (bomId: number) => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<WizardStep>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  const [skuId, setSkuId] = useState<number | null>(null)
  const [existingBomId, setExistingBomId] = useState<number | null>(null)
  const [existingBomCode, setExistingBomCode] = useState<string | null>(null)
  const [bomCode, setBomCode] = useState("")
  const [entryMethod, setEntryMethod] = useState<EntryMethod | null>(null)
  const [csvParsed, setCsvParsed] = useState(false)
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const [rmRows, setRmRows] = useState<BomLineRow[]>([])
  const [pmRows, setPmRows] = useState<BomLineRow[]>([])

  const isDirty = skuId != null || rmRows.length > 0 || pmRows.length > 0

  function resetAll() {
    setStep(1)
    setError(null)
    setShowCloseConfirm(false)
    setSkuId(null)
    setExistingBomId(null)
    setExistingBomCode(null)
    setBomCode("")
    setEntryMethod(null)
    setCsvParsed(false)
    setCsvErrors([])
    setRmRows([])
    setPmRows([])
    setLoading(false)
  }

  function closeWizard() {
    setOpen(false)
    resetAll()
  }

  function requestClose() {
    if (isDirty) setShowCloseConfirm(true)
    else closeWizard()
  }

  async function handleSelectSku(id: number) {
    setError(null)
    setSkuId(id)
    const sku = skus.find((s) => s.id === id)
    setLoading(true)
    try {
      const res = await fetch("/api/masters/bom-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-existing", sku_id: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to check existing BOMs")

      if (data.hasActive) {
        setExistingBomId(data.bom_id)
        setExistingBomCode(data.bom_code)
        setStep(2)
      } else {
        setBomCode(sku ? `${sku.sku_code}-BOM` : "")
        setStep(3)
      }
    } catch (e: any) {
      setError(e.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  function handleUpdateExisting() {
    if (existingBomId == null) return
    onEditExisting(existingBomId)
    closeWizard()
  }

  function handleCreateNewVersion() {
    const sku = skus.find((s) => s.id === skuId)
    setBomCode(sku ? `${sku.sku_code}-V2` : "")
    setStep(3)
  }

  function chooseEntryMethod(method: EntryMethod) {
    setEntryMethod(method)
    setCsvParsed(method === "manual") // manual entry has no separate "parsed" gate
    setStep(4)
  }

  function handleCsvFile(file: File) {
    setCsvErrors([])
    file.text().then((text) => {
      const { rows, errors } = parseBomCsv(text, rmMaterials, pmMaterials)
      if (errors.length > 0) {
        setCsvErrors(errors)
        return
      }
      setRmRows(rows.filter((r) => r.mtrl_type === "rm"))
      setPmRows(rows.filter((r) => r.mtrl_type === "pm"))
      setCsvParsed(true)
    })
  }

  function goBack() {
    setError(null)
    // Step 3's "back" skips Step 2 if it was never shown (SKU had no existing
    // active BOM, so existingBomId is still null) — otherwise every other
    // step just steps back by 1. Step 1 is the first step, so it has no back target.
    if (step === 3) setStep(existingBomId != null ? 2 : 1)
    else setStep((s) => (s - 1) as WizardStep)
  }

  const rmValid = rmRows.length > 0 && isRmTotalValid(rmTotal(rmRows))
  const allRmFieldsFilled = rmRows.every((r) => r.mtrl_id && r.amount && r.effective_from)
  const allPmFieldsFilled = pmRows.every((r) => r.mtrl_id && r.amount && r.effective_from)
  const canProceedFromLines = rmValid && allRmFieldsFilled && allPmFieldsFilled && bomCode.trim().length > 0

  async function handleSubmit() {
    setError(null)
    if (!skuId) { setError("Select a SKU first."); return }
    if (!bomCode.trim()) { setError("BOM code is required."); return }
    if (rmRows.length === 0) { setError("At least one RM line is required."); return }
    if (!isRmTotalValid(rmTotal(rmRows))) {
      setError(`RM percentages must total between 99.9% and 100.1% (currently ${rmTotal(rmRows).toFixed(2)}%).`)
      return
    }
    for (const r of [...rmRows, ...pmRows]) {
      if (!r.mtrl_id || !r.amount || !r.effective_from) {
        setError("Every line requires a material, amount, and effective-from date.")
        return
      }
    }

    setLoading(true)
    try {
      const toLine = (r: BomLineRow) => ({
        mtrl_type: r.mtrl_type,
        mtrl_id: r.mtrl_id,
        amount: Number(r.amount),
        uom: r.uom || null,
        effective_from: r.effective_from,
        effective_till: r.effective_till || null,
      })
      const res = await fetch("/api/masters/bom-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-full",
          mode: "new-version",
          sku_id: skuId,
          bom_code: bomCode.trim(),
          source: entryMethod === "csv" ? "csv" : "manual",
          rm_lines: rmRows.map(toLine),
          pm_lines: pmRows.map(toLine),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit BOM")
      closeWizard()
      toast({ title: "BOM submitted for approval", description: bomCode.trim(), variant: "success" })
      onSuccess()
    } catch (e: any) {
      setError(e.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return {
    open,
    setOpen,
    step,
    setStep,
    loading,
    error,
    showCloseConfirm,
    setShowCloseConfirm,
    skuId,
    existingBomId,
    existingBomCode,
    bomCode,
    setBomCode,
    entryMethod,
    csvParsed,
    csvErrors,
    rmRows,
    setRmRows,
    pmRows,
    setPmRows,
    requestClose,
    closeWizard,
    handleSelectSku,
    handleUpdateExisting,
    handleCreateNewVersion,
    chooseEntryMethod,
    handleCsvFile,
    goBack,
    canProceedFromLines,
    handleSubmit,
  }
}
