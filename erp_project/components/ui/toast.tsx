"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Variant = "success" | "error" | "info"

type ToastItem = {
  id: string
  title: string
  description?: string
  variant: Variant
}

type ToastFn = (opts: { title: string; description?: string; variant?: Variant }) => void

const ToastContext = createContext<{ toast: ToastFn } | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside ToastProvider")
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback<ToastFn>(({ title, description, variant = "info" }) => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-9999 flex flex-col-reverse gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-xl text-sm max-w-sm w-full",
              "animate-in slide-in-from-bottom-2 fade-in duration-200",
              t.variant === "success" &&
                "bg-teal-50 border-teal-200 text-teal-900 dark:bg-teal-900 dark:border-teal-700 dark:text-teal-50",
              t.variant === "error" &&
                "bg-red-50 border-red-200 text-red-900 dark:bg-red-900 dark:border-red-700 dark:text-red-50",
              t.variant === "info" &&
                "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-50"
            )}
          >
            {t.variant === "success" && (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
            )}
            {t.variant === "error" && (
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            )}
            {t.variant === "info" && (
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug">{t.title}</p>
              {t.description && (
                <p className="text-xs opacity-75 mt-0.5">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
