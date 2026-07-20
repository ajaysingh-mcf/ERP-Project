"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import Fuse from "fuse.js"
import { cn } from "@/lib/utils"

/**
 * Text input + fuzzy-filtered dropdown, for large option lists (Makes, INCI
 * Names, SKUs) where users only remember a few characters and exact
 * substring matching in a plain <select> makes finding the right entry slow.
 *
 * Drop-in replacement for a plain <select>: pass `onAddNew` to keep the
 * existing "+ Add new…" free-text fallback pattern used across the app.
 *
 * Defaults to plain string options. For object options (e.g. SKU rows),
 * pass `getLabel`/`getValue`/`searchKeys` — `value`/`onChange` still deal
 * only in the resolved string value, so callers don't need to change how
 * they store the selected value.
 */
export function FuzzySelect<T = string>({
  options,
  value,
  onChange,
  onAddNew,
  placeholder = "Select…",
  addNewLabel = "+ Add new…",
  className,
  disabled,
  getLabel = (opt: T) => String(opt),
  getValue = (opt: T) => String(opt),
  searchKeys,
}: {
  options: T[]
  value: string
  onChange: (value: string) => void
  onAddNew?: () => void
  placeholder?: string
  addNewLabel?: string
  className?: string
  disabled?: boolean
  getLabel?: (opt: T) => string
  getValue?: (opt: T) => string
  /** Fuse.js `keys` — required for object options, ignored for plain strings. */
  searchKeys?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const fuse = useMemo(
    () => new Fuse(options, searchKeys ? { threshold: 0.4, ignoreLocation: true, keys: searchKeys } : { threshold: 0.4, ignoreLocation: true }),
    [options, searchKeys]
  )

  const filtered = useMemo(() => {
    if (!query) return options
    return fuse.search(query).map((r) => r.item)
  }, [query, fuse, options])

  const selectedOption = useMemo(
    () => options.find((opt) => getValue(opt) === value),
    [options, value, getValue]
  )
  const displayValue = selectedOption ? getLabel(selectedOption) : value

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  function selectOption(opt: T) {
    onChange(getValue(opt))
    setQuery("")
    setOpen(false)
  }

  function selectAddNew() {
    onAddNew?.()
    setQuery("")
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const total = filtered.length + (onAddNew ? 1 : 0)
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, total - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (highlighted < filtered.length) selectOption(filtered[highlighted])
      else if (onAddNew) selectAddNew()
    } else if (e.key === "Escape") {
      setOpen(false)
      setQuery("")
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={cn(
          "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        placeholder={placeholder}
        value={open ? query : displayValue}
        disabled={disabled}
        onFocus={() => {
          setOpen(true)
          setHighlighted(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlighted(0)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
          )}
          {filtered.map((opt, i) => (
            <div
              key={getValue(opt)}
              className={cn(
                "px-3 py-1.5 text-sm cursor-pointer",
                i === highlighted ? "bg-muted text-foreground" : "hover:bg-muted/60"
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                selectOption(opt)
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              {getLabel(opt)}
            </div>
          ))}
          {onAddNew && (
            <div
              className={cn(
                "px-3 py-1.5 text-sm cursor-pointer border-t border-border text-primary",
                highlighted === filtered.length ? "bg-muted" : "hover:bg-muted/60"
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                selectAddNew()
              }}
              onMouseEnter={() => setHighlighted(filtered.length)}
            >
              {addNewLabel}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
