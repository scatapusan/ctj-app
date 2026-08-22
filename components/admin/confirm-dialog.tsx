"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * One confirmation dialog for every admin action that changes stored data.
 *
 * Before this, the console had three different answers to "are you sure":
 * a native window.confirm on the attendance screen, an in-place "Delete" ->
 * "Confirm Delete" button swap on members and events, and nothing at all on the
 * category dropdown, the role toggles, the PIN reset and the day-of check-in.
 * The button swap was the worst of them — the second button lands exactly where
 * the first one was, so two quick taps in the same spot destroy a record.
 *
 * The rules this encodes:
 *
 *   * The dialog names the PERSON or RECORD. "Mark Juan Dela Cruz attended?"
 *     answers the question a leader actually has at the check-in desk, which is
 *     "did I tap the right row?", so the extra tap buys something.
 *   * Cancel takes focus, not Confirm. Enter and a stray tap both do nothing.
 *   * Cancel and Confirm are far apart and full-height, because the mis-tap
 *     this exists to prevent is a thumb on a phone.
 *   * Anything irreversible says so, in the body, in plain words.
 */

export type ConfirmTone = "destructive" | "default"

export interface ConfirmOptions {
  /** Short question naming the record: "Cancel Juan Dela Cruz's registration?" */
  title: string
  /** What will actually happen, and whether it can be undone. */
  body?: React.ReactNode
  /** Verb for the confirm button: "Cancel registration", "Mark attended". */
  confirmLabel: string
  cancelLabel?: string
  /** 'destructive' for anything that loses data or cannot be undone. */
  tone?: ConfirmTone
}

type Pending = ConfirmOptions

/**
 * Ask for confirmation and await the answer:
 *
 *   const { confirm, confirmDialog } = useConfirm()
 *   if (!(await confirm({ title: "…", confirmLabel: "…" }))) return
 *   // …and render {confirmDialog} once, anywhere in the tree.
 *
 * Resolving to false on cancel means every call site reads as a guard clause,
 * so an action can never proceed by forgetting to handle the "no" branch.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null)
  // The resolver lives in a ref, not in state: settling inside a state updater
  // would fire the side effect twice under StrictMode's double-invoke.
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // A second ask while one is open answers the first with "no" rather than
      // stranding its caller waiting on a promise nothing will ever settle.
      resolveRef.current?.(false)
      resolveRef.current = resolve
      setPending(options)
    })
  }, [])

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setPending(null)
    resolve?.(confirmed)
  }, [])

  // A caller that unmounts mid-question must not leave an unsettled promise.
  useEffect(() => {
    return () => resolveRef.current?.(false)
  }, [])

  const confirmDialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      body={pending.body}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      tone={pending.tone}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return { confirm, confirmDialog }
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "destructive",
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<Element | null>(null)

  // Escape always cancels — never confirms.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onCancel])

  // Focus CANCEL, not confirm: a reflexive Enter or Space must not destroy
  // anything. Page scroll is held and focus restored on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    cancelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-foreground/60" onClick={onCancel} aria-hidden="true" />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={body ? "confirm-dialog-body" : undefined}
        className="relative glass rounded-2xl w-full max-w-md my-8 sm:my-auto p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          {tone === "destructive" && (
            <span className="shrink-0 mt-0.5 text-destructive" aria-hidden="true">
              <AlertTriangle className="size-5" />
            </span>
          )}
          <div className="space-y-2 min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-extrabold text-foreground">
              {title}
            </h2>
            {body && (
              <div id="confirm-dialog-body" className="text-sm font-medium text-muted-foreground">
                {body}
              </div>
            )}
          </div>
        </div>

        {/* On a phone (flex-col-reverse) Cancel renders BOTTOM-most, where a
            resting thumb naturally lands, and Confirm sits above it — so the
            easiest button to hit by reflex is the harmless one. On a wider
            screen it is the conventional Cancel-then-Confirm row. */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-1">
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={onCancel}
            className="min-h-[44px] w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            className="min-h-[44px] w-full sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
