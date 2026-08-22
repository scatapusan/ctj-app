"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { X, ImageOff } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * The full record for one retreat registration.
 *
 * Everything the registration form collects lives here — birthday, address,
 * contact number, guardian details and the baby photo — and until this panel
 * existed none of it appeared in any screen. The only way to read a
 * registrant's guardian contact was to download the CSV of all 44 of them.
 *
 * Shown to admin AND core leaders: the ministry decided core runs the retreat
 * day-of and needs the same access. That is real PII about minors on screen, so
 * the panel loads a record only when it is opened, drops it again on close, and
 * the route behind it sends no-store.
 */

export interface RegistrantDetail {
  id: string
  memberId: string
  eventId: string
  eventName: string | null
  eventDate: string | null
  firstName: string | null
  middleName: string | null
  lastName: string | null
  name: string
  nickname: string | null
  email: string | null
  birthdate: string | null
  age: number | null
  address: string | null
  contactNumber: string | null
  category: "youth" | "ya" | null
  isCore: boolean
  categoryLabel: string
  status: "registered" | "attended"
  registeredAt: string | null
  attendedAt: string | null
  guardianName: string | null
  guardianContact: string | null
  hasBabyPhoto: boolean
  babyPhotoUrl: string | null
}

/** A date-only value ('2010-09-05') read in LOCAL time, not shifted by a UTC parse. */
function formatDateOnly(value: string | null): string | null {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return isNaN(date.getTime()) ? null : format(date, "MMMM d, yyyy")
}

function formatTimestamp(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : format(date, "MMM d, yyyy · h:mm a")
}

/** One labelled value. Renders an em dash rather than hiding an empty field:
 *  "no address on file" is itself something a leader needs to be able to see. */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground mt-0.5 break-words">
        {value ? value : <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground">{children}</h3>
  )
}

export function RegistrantDetail({
  attendanceId,
  onClose,
}: {
  attendanceId: string | null
  onClose: () => void
}) {
  const [record, setRecord] = useState<RegistrantDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoExpanded, setPhotoExpanded] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<Element | null>(null)

  const open = attendanceId !== null

  useEffect(() => {
    if (!attendanceId) {
      setRecord(null)
      setError(null)
      setPhotoExpanded(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setRecord(null)
    setPhotoExpanded(false)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/attendance/${encodeURIComponent(attendanceId)}`)
        if (cancelled) return
        if (!res.ok) {
          setError(
            res.status === 403
              ? "Your session has expired. Please sign in again."
              : res.status === 404
                ? "That registration no longer exists."
                : "Couldn't load this registration. Please try again.",
          )
          return
        }
        const data = await res.json()
        if (!cancelled) setRecord(data.record as RegistrantDetail)
      } catch {
        if (!cancelled) setError("Network error loading this registration.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [attendanceId])

  const handleClose = useCallback(() => {
    setPhotoExpanded(false)
    onClose()
  }, [onClose])

  // Escape closes the enlarged photo first, then the panel — so a leader who
  // zoomed into a photo does not lose the whole record on one keypress.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      if (photoExpanded) setPhotoExpanded(false)
      else onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, photoExpanded, onClose])

  // Keep Tab inside the panel. Without this, tabbing walks out of an
  // aria-modal dialog and onto the cancel-registration buttons it is covering.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
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
  }, [open])

  // Hold the page still behind the panel, and give focus back where it was.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-foreground/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* my-auto rather than the container centering the child: a flex item
          centered in a scroll container has its overflowing top cut off, with
          no way to scroll back up to it. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="registrant-detail-heading"
        className="relative glass rounded-2xl w-full max-w-2xl my-4 sm:my-auto p-5 sm:p-6 space-y-5"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={handleClose}
          aria-label="Close registrant details"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="size-5" />
        </button>

        {loading && (
          <div className="space-y-4" aria-busy="true" role="status" aria-label="Loading registration">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-32 w-32 rounded-xl" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm font-bold text-foreground">{error}</p>
            <p className="text-xs font-medium text-muted-foreground">
              Close this and refresh the list if it keeps happening.
            </p>
          </div>
        )}

        {!loading && record && (
          <>
            <div className="pr-10 space-y-2">
              <h2 id="registrant-detail-heading" className="text-xl font-extrabold text-foreground">
                {record.name}
                {record.nickname && (
                  <span className="font-bold text-muted-foreground"> · {record.nickname}</span>
                )}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {record.categoryLabel && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-secondary text-foreground ring-1 ring-border">
                    {record.categoryLabel}
                  </span>
                )}
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    record.status === "attended"
                      ? "bg-secondary text-foreground ring-1 ring-foreground"
                      : "bg-muted text-muted-foreground ring-1 ring-border"
                  }`}
                >
                  {record.status === "attended" ? "Attended" : "Pre-registered"}
                </span>
                {record.eventName && (
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {record.eventName}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-5">
              {/* Baby photo */}
              <div className="shrink-0">
                {record.babyPhotoUrl ? (
                  <button
                    type="button"
                    onClick={() => setPhotoExpanded(true)}
                    aria-label={`Enlarge ${record.name}'s baby photo`}
                    className="rounded-xl overflow-hidden border-2 border-foreground hover:opacity-80 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={record.babyPhotoUrl}
                      alt={`${record.name} as a child`}
                      className="w-32 h-32 sm:w-36 sm:h-36 object-cover"
                    />
                  </button>
                ) : (
                  <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                    <ImageOff className="size-6" />
                    <span className="text-[11px] font-bold text-center px-2">
                      {record.hasBabyPhoto ? "Photo unavailable" : "No baby photo"}
                    </span>
                  </div>
                )}
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 flex-1 min-w-0">
                <Field label="Email" value={record.email} />
                <Field label="Contact number" value={record.contactNumber} />
                <Field label="Birthday" value={formatDateOnly(record.birthdate)} />
                <Field
                  label="Age at the retreat"
                  value={record.age !== null ? `${record.age} years old` : null}
                />
                <div className="sm:col-span-2">
                  <Field label="Address" value={record.address} />
                </div>
              </dl>
            </div>

            <div className="h-px bg-border/40" />

            <div className="space-y-3">
              <SectionHeading>Guardian</SectionHeading>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Guardian name" value={record.guardianName} />
                <Field label="Guardian contact" value={record.guardianContact} />
              </dl>
              {!record.guardianName && !record.guardianContact && (
                <p className="text-[11px] font-medium text-muted-foreground">
                  Guardian details are only asked of registrants who are minors on the day.
                </p>
              )}
            </div>

            <div className="h-px bg-border/40" />

            <div className="space-y-3">
              <SectionHeading>Registration</SectionHeading>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {record.middleName && (
                  <div className="sm:col-span-2">
                    <Field
                      label="Full name"
                      value={[record.firstName, record.middleName, record.lastName]
                        .filter(Boolean)
                        .join(" ")}
                    />
                  </div>
                )}
                <Field label="Registered" value={formatTimestamp(record.registeredAt)} />
                <Field label="Marked attended" value={formatTimestamp(record.attendedAt)} />
              </dl>
            </div>

            <p className="text-[11px] font-medium text-muted-foreground">
              Personal details of a registrant — including minors. Please don&apos;t screenshot or
              forward this screen. The photo link expires within minutes.
            </p>
          </>
        )}
      </div>

      {/* Enlarged photo, over the panel rather than replacing it. */}
      {photoExpanded && record?.babyPhotoUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/70"
            onClick={() => setPhotoExpanded(false)}
            aria-hidden="true"
          />
          <div className="relative glass rounded-2xl p-4 max-w-lg w-full space-y-3">
            <button
              type="button"
              onClick={() => setPhotoExpanded(false)}
              aria-label="Close enlarged photo"
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
            <p className="text-sm font-extrabold text-foreground pr-8">{record.name}</p>
            {/* Portrait baby photos are tall — contained in the viewport rather
                than letting the bottom fall off the screen. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={record.babyPhotoUrl}
              alt={`${record.name} as a child`}
              className="w-full max-h-[75vh] object-contain rounded-xl border-2 border-foreground"
            />
          </div>
        </div>
      )}
    </div>
  )
}
