"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type Event } from "@/lib/types"
import { DataTable } from "@/components/admin/data-table"
import { ListSkeleton } from "@/components/admin/list-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { RegistrantDetail, type RegistrantDetail as RegistrantDetailRecord } from "@/components/admin/registrant-detail"
import { useRole } from "@/components/admin/role-provider"
import { useConfirm } from "@/components/admin/confirm-dialog"
import {
  Download,
  Calendar,
  Users,
  ClipboardList,
  Loader2,
  Eye,
  Image as ImageIcon,
  FileArchive,
} from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"
import { toast } from "sonner"

interface AttendanceRecord {
  id: string
  member_name: string
  email: string
  checked_in_at: string
  status: "registered" | "attended"
  attended_at: string | null
  category: "youth" | "ya" | null
  is_core: boolean
  /** Whether a baby photo is on file — not the photo itself. */
  has_baby_photo: boolean
}

/**
 * Inline Category corrector: Core is self-selected on the retreat form now, so
 * the admin console is where mistakes get fixed. Picking Core keeps the stored
 * age bracket; picking Youth/YA clears the Core label.
 */
function CategorySelect({
  record,
  onChange,
}: {
  record: AttendanceRecord
  onChange: (id: string, value: "youth" | "ya" | "core") => void
}) {
  const value = record.is_core ? "core" : (record.category ?? "")
  return (
    <select
      value={value}
      onChange={(e) => onChange(record.id, e.target.value as "youth" | "ya" | "core")}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Category for ${record.member_name}`}
      className="text-xs font-bold rounded-full bg-secondary text-foreground ring-1 ring-border px-2 py-1 cursor-pointer hover:ring-foreground focus:outline-none focus:ring-foreground"
    >
      {value === "" && <option value="">—</option>}
      <option value="youth">Youth</option>
      <option value="ya">YA</option>
      <option value="core">Core</option>
    </select>
  )
}

/**
 * Opens the full record. The row itself is clickable too, but a real button is
 * what makes the detail reachable by keyboard and announced by a screen reader.
 */
function ViewButton({
  record,
  onView,
}: {
  record: AttendanceRecord
  onView: (record: AttendanceRecord) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onView(record)
      }}
      aria-label={`View full details for ${record.member_name}`}
      title="View full registration details"
      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <Eye className="size-4" />
    </button>
  )
}

function StatusBadge({ status }: { status: AttendanceRecord["status"] }) {
  return status === "registered" ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-muted text-muted-foreground ring-1 ring-border shrink-0">
      Pre-registered
    </span>
  ) : (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-secondary text-foreground ring-1 ring-foreground shrink-0">
      Attended
    </span>
  )
}

/** Marks the rows whose registrant uploaded a baby photo. */
function PhotoMark({ record }: { record: AttendanceRecord }) {
  if (!record.has_baby_photo) return null
  return (
    <ImageIcon
      className="size-3.5 shrink-0 text-muted-foreground"
      aria-label="Baby photo on file"
    />
  )
}

export default function AttendancePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [downloadingPhotos, setDownloadingPhotos] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  /** The event whose records the newest in-flight request is for. */
  const latestRequest = useRef<string | null>(null)
  // `loading` matters here: the provider starts every session as a non-admin
  // while /api/admin/me is in flight, so gating on isSuperadmin alone makes the
  // cancel control vanish and reappear for a real admin. The slot is held open
  // instead of collapsing the row.
  const { isSuperadmin, loading: roleLoading } = useRole()
  const { confirm, confirmDialog } = useConfirm()

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/events")
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events as Event[])
        }
      } catch {
        // leave empty on error
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function selectEvent(eventId: string) {
    setSelectedEventId(eventId)
    setRecordsLoading(true)
    setDetailId(null)
    // Tapping two events quickly used to be decided by whichever response
    // landed last. Every write below is gated on this still being the
    // selection, so a slow first response can no longer replace a fast second.
    latestRequest.current = eventId

    try {
      const res = await fetch(`/api/admin/attendance?eventId=${encodeURIComponent(eventId)}`)
      if (latestRequest.current !== eventId) return
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records as AttendanceRecord[])
      } else {
        setRecords([])
        // An empty table otherwise reads as "nobody registered", which on the
        // day of the retreat is the most alarming possible way to say "your
        // session expired".
        toast.error(
          res.status === 403
            ? "Your session has expired. Please sign in again."
            : "Couldn't load this event's registrations. Please try again.",
        )
      }
    } catch {
      if (latestRequest.current !== eventId) return
      setRecords([])
      toast.error("Network error loading this event's registrations.")
    } finally {
      if (latestRequest.current === eventId) setRecordsLoading(false)
    }
  }

  /**
   * Correct one registrant's category. It writes to the database on a single
   * tap from a <select> that sits inside a row, so it asks first — the mistake
   * it guards against is scrolling a list on a phone and changing a stranger's
   * registration without ever noticing.
   */
  async function changeCategory(id: string, value: "youth" | "ya" | "core") {
    const record = records.find((r) => r.id === id)
    if (!record) return

    const label = value === "core" ? "Core" : value === "ya" ? "YA" : "Youth"
    const ok = await confirm({
      title: `Change ${record.member_name} to ${label}?`,
      body:
        value === "core"
          ? "Core is a registration label, so their age bracket is kept as it is. You can change this back at any time."
          : `This replaces their age bracket with ${label} and clears the Core label. You can change this back at any time.`,
      confirmLabel: `Set to ${label}`,
      tone: "default",
    })
    if (!ok) {
      // Put the <select> back to what is actually stored: it is a controlled
      // input, but React will not re-render it if state never changed.
      setRecords((rs) => [...rs])
      return
    }

    const previous = records
    const forEvent = selectedEventId
    // Optimistic: Core keeps the stored bracket, Youth/YA clears the label.
    setRecords((rs) =>
      rs.map((r) =>
        r.id !== id ? r : value === "core" ? { ...r, is_core: true } : { ...r, category: value, is_core: false },
      ),
    )
    try {
      const res = await fetch("/api/admin/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, category: value }),
      })
      if (!res.ok) throw new Error()
      toast.success("Category updated")
    } catch {
      // Only roll back if we are still looking at the same event — otherwise
      // this would restore the previous event's rows over the current list.
      if (latestRequest.current === forEvent) setRecords(previous)
      toast.error("Couldn't update the category. Please try again.")
    }
  }

  async function cancelRegistration(record: AttendanceRecord) {
    const label = record.status === "attended" ? "attendance record" : "pre-registration"
    const ok = await confirm({
      title: `Cancel ${record.member_name}'s ${label}?`,
      body: (
        <>
          <p>
            This removes them from this event&apos;s list and{" "}
            <strong className="text-foreground">cannot be undone</strong>. Their baby photo for this
            event is deleted too.
          </p>
          <p className="mt-2">
            Their member profile is kept, and they can register again later.
          </p>
        </>
      ),
      confirmLabel: "Cancel registration",
      cancelLabel: "Keep it",
      tone: "destructive",
    })
    if (!ok) return

    const previous = records
    const forEvent = selectedEventId
    setRecords((rs) => rs.filter((r) => r.id !== record.id))
    // The panel is where this is triggered from now, so it always closes.
    if (detailId === record.id) setDetailId(null)
    try {
      const res = await fetch(`/api/admin/attendance?id=${encodeURIComponent(record.id)}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      toast.success(`${record.member_name} removed from this event`)
    } catch {
      if (latestRequest.current === forEvent) setRecords(previous)
      toast.error("Couldn't cancel that registration. Please try again.")
    }
  }

  /** How many of this event's registrants uploaded a baby photo. */
  const photoCount = useMemo(() => records.filter((r) => r.has_baby_photo).length, [records])

  /**
   * The CSV is built server-side: it carries every registration answer —
   * birthday, address, contact number and guardian details — which the table on
   * this page deliberately never loads. Available to admin and core alike, so a
   * 403 here means the session lapsed rather than the role being wrong.
   */
  async function exportCsv() {
    if (!records.length || !selectedEventId) return
    setExporting(true)
    try {
      const res = await fetch(
        `/api/admin/attendance/export?eventId=${encodeURIComponent(selectedEventId)}`,
      )
      if (!res.ok) {
        toast.error(
          res.status === 403
            ? "Your session has expired. Please sign in again."
            : "Couldn't build the export. Please try again.",
        )
        return
      }
      // Small enough to buffer, unlike the photo archive below.
      const blob = await res.blob()
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "attendance-export.csv"
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Network error building the export. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  /**
   * Every baby photo for this event in one zip, each file named after the
   * person in it. Built and streamed by the server — the photos live in a
   * private bucket, so the browser never gets a downloadable link to them.
   *
   * Unlike the CSV, this is NOT fetched into a blob first. The archive can run
   * to tens of megabytes, and buffering it would hold the whole thing in a
   * phone's memory before writing a byte to disk. Navigating to the URL lets
   * the browser stream it straight to the downloads folder with its own
   * progress UI. The cost is that a failure response would render as raw JSON
   * where a file was expected, so the probe below asks the same route the same
   * question first and turns any refusal into a toast.
   */
  async function downloadPhotos() {
    if (!selectedEventId || photoCount === 0) return
    const url = `/api/admin/attendance/photos?eventId=${encodeURIComponent(selectedEventId)}`
    setDownloadingPhotos(true)
    try {
      const probe = await fetch(`${url}&probe=1`)
      if (!probe.ok) {
        toast.error(
          probe.status === 403
            ? "Your session has expired. Please sign in again."
            : probe.status === 404
              ? "No baby photos have been uploaded for this event yet."
              : "Couldn't build the photo download. Please try again.",
        )
        return
      }

      const { count } = (await probe.json()) as { count: number }
      const link = document.createElement("a")
      link.href = url
      link.rel = "noopener"
      link.click()
      toast.success(
        `Downloading ${count} photo${count === 1 ? "" : "s"} — check your downloads.`,
      )
    } catch {
      toast.error("Network error starting the photo download. Please try again.")
    } finally {
      setDownloadingPhotos(false)
    }
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId)
  const closeDetail = useCallback(() => setDetailId(null), [])
  const openDetail = useCallback((record: AttendanceRecord) => setDetailId(record.id), [])

  if (loading) {
    return <ListSkeleton rows={5} showSearch={false} />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Attendance Records</h1>
        <p className="text-sm text-muted-foreground mt-1">View and export attendance per event</p>
      </div>

      {/* Event selector */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-accent/80 uppercase tracking-wider">
          Select Event
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => selectEvent(event.id)}
              className={`text-left p-3 rounded-xl border transition-all duration-200 ${
                selectedEventId === event.id
                  ? "border-foreground bg-secondary ring-1 ring-foreground"
                  : "border-border/30 bg-muted/50 hover:border-foreground hover:bg-card"
              }`}
            >
              <p className="font-medium text-sm text-foreground truncate">{event.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="size-3" />
                {format(new Date(event.event_date), "MMM d, yyyy")}
              </p>
            </button>
          ))}
        </div>

        {events.length === 0 && (
          <div className="text-center py-6 space-y-3">
            <ClipboardList className="size-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No events yet.</p>
            <Link
              href="/admin/events"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent underline underline-offset-2"
            >
              Create your first event
            </Link>
          </div>
        )}
      </div>

      {/* Attendance records */}
      {selectedEventId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedEvent?.name}
              </h2>
              <span className="flex items-center gap-1 text-sm text-accent bg-secondary px-2.5 py-1 rounded-full ring-1 ring-foreground">
                <Users className="size-3.5" />
                {records.filter((r) => r.status === "attended").length} attended
                {records.some((r) => r.status === "registered") &&
                  ` · ${records.filter((r) => r.status === "registered").length} pre-registered`}
              </span>
            </div>
            {records.length > 0 && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
                    {exporting ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="size-4 mr-2" />
                    )}
                    Export CSV
                  </Button>
                  {/* The title sits on the wrapper: a disabled button swallows
                      pointer events, so its own tooltip never appears. */}
                  <span
                    title={
                      photoCount === 0
                        ? "Nobody has uploaded a baby photo for this event yet"
                        : "Download every baby photo, each file named after the person"
                    }
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadPhotos}
                      disabled={downloadingPhotos || photoCount === 0}
                    >
                      {downloadingPhotos ? (
                        <Loader2 className="size-4 mr-2 animate-spin" />
                      ) : (
                        <FileArchive className="size-4 mr-2" />
                      )}
                      Baby photos ({photoCount})
                    </Button>
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground text-right max-w-sm">
                  CSV includes birthday, address, contact, guardian details and photo links that
                  stay live for a week. Photos download as a zip, each file named after the person
                  &mdash; &ldquo;Juan Dela Cruz.jpg&rdquo;.
                </p>
              </div>
            )}
          </div>

          {recordsLoading ? (
            <div className="space-y-3" aria-busy="true" role="status" aria-label="Loading attendance records">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24 ml-auto" />
                </div>
              ))}
            </div>
          ) : (
            <DataTable
              data={records as unknown as Record<string, unknown>[]}
              onRowClick={(item) => openDetail(item as unknown as AttendanceRecord)}
              columns={[
                {
                  key: "member_name",
                  label: "Name",
                  sortable: true,
                  render: (item) => {
                    const r = item as unknown as AttendanceRecord
                    return (
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{r.member_name}</span>
                        <PhotoMark record={r} />
                      </span>
                    )
                  },
                },
                { key: "email", label: "Email", sortable: true },
                {
                  key: "category",
                  label: "Category",
                  sortable: true,
                  render: (item) => (
                    <CategorySelect
                      record={item as unknown as AttendanceRecord}
                      onChange={changeCategory}
                    />
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  sortable: true,
                  render: (item) => (
                    <StatusBadge status={(item as unknown as AttendanceRecord).status} />
                  ),
                },
                {
                  key: "checked_in_at",
                  label: "Checked In",
                  sortable: true,
                  render: (item) => {
                    const r = item as unknown as AttendanceRecord
                    return (
                      <span className="text-xs">
                        {format(new Date(r.checked_in_at), "h:mm a")}
                      </span>
                    )
                  },
                },
                {
                  key: "actions",
                  label: "",
                  render: (item) => {
                    const r = item as unknown as AttendanceRecord
                    return (
                      <span className="flex items-center justify-end">
                        <ViewButton record={r} onView={openDetail} />
                      </span>
                    )
                  },
                },
              ]}
              searchKeys={["member_name", "email"]}
              searchPlaceholder="Search attendees..."
              emptyMessage="No one has checked in for this event yet."
              mobileCard={(item) => {
                const r = item as unknown as AttendanceRecord
                return (
                  <div className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate flex items-center gap-1.5">
                        <span className="truncate">{r.member_name}</span>
                        <PhotoMark record={r} />
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {/* Category and View only. Cancelling a registration
                          lives in the detail panel now — it used to sit one
                          thumb-width from View, which on a phone is a mis-tap
                          away from an irreversible delete. */}
                      <div className="flex items-center gap-2">
                        <CategorySelect record={r} onChange={changeCategory} />
                        <ViewButton record={r} onView={openDetail} />
                      </div>
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-accent/80 font-medium">
                        {format(new Date(r.checked_in_at), "h:mm a")}
                      </span>
                    </div>
                  </div>
                )
              }}
            />
          )}

          {records.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Open a registrant to see their birthday, age, address, contact number, guardian details
              and baby photo.
            </p>
          )}
        </div>
      )}

      <RegistrantDetail
        attendanceId={detailId}
        onClose={closeDetail}
        // Cancelling is admin-only, and it lives here rather than in the row so
        // it can never be reached without first opening the record and seeing
        // whose it is. Withheld until the role is known.
        onCancelRegistration={
          isSuperadmin && !roleLoading
            ? (detail: RegistrantDetailRecord) =>
                cancelRegistration({
                  id: detail.id,
                  member_name: detail.name,
                  status: detail.status,
                } as AttendanceRecord)
            : undefined
        }
      />

      {confirmDialog}
    </div>
  )
}
