"use client"

import { useEffect, useState } from "react"
import { type Event } from "@/lib/types"
import { DataTable } from "@/components/admin/data-table"
import { ListSkeleton } from "@/components/admin/list-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Download, Calendar, Users, ClipboardList, Trash2, Loader2 } from "lucide-react"
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

/** Cancel/remove one registration. Irreversible, so it always confirms first. */
function CancelButton({
  record,
  onCancel,
}: {
  record: AttendanceRecord
  onCancel: (record: AttendanceRecord) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onCancel(record)
      }}
      aria-label={`Cancel registration for ${record.member_name}`}
      title="Cancel this registration"
      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
    >
      <Trash2 className="size-4" />
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

export default function AttendancePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

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

    try {
      const res = await fetch(`/api/admin/attendance?eventId=${encodeURIComponent(eventId)}`)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records as AttendanceRecord[])
      } else {
        setRecords([])
      }
    } catch {
      setRecords([])
    } finally {
      setRecordsLoading(false)
    }
  }

  async function changeCategory(id: string, value: "youth" | "ya" | "core") {
    const previous = records
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
      setRecords(previous)
      toast.error("Couldn't update the category. Please try again.")
    }
  }

  async function cancelRegistration(record: AttendanceRecord) {
    const label = record.status === "attended" ? "attendance record" : "pre-registration"
    const ok = window.confirm(
      `Cancel the ${label} for ${record.member_name}?\n\n` +
        `This removes them from this event's list and cannot be undone. ` +
        `Their member profile is kept, and they can register again later.`,
    )
    if (!ok) return

    const previous = records
    setRecords((rs) => rs.filter((r) => r.id !== record.id))
    try {
      const res = await fetch(`/api/admin/attendance?id=${encodeURIComponent(record.id)}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      toast.success(`${record.member_name} removed from this event`)
    } catch {
      setRecords(previous)
      toast.error("Couldn't cancel that registration. Please try again.")
    }
  }

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

  const selectedEvent = events.find((e) => e.id === selectedEventId)

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
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="size-4 mr-2" />
                  )}
                  Export CSV
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Includes birthday, address, contact and guardian details.
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
              columns={[
                { key: "member_name", label: "Name", sortable: true },
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
                  key: "cancel",
                  label: "",
                  render: (item) => (
                    <CancelButton
                      record={item as unknown as AttendanceRecord}
                      onCancel={cancelRegistration}
                    />
                  ),
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
                      <p className="font-medium text-foreground truncate">{r.member_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <CategorySelect record={r} onChange={changeCategory} />
                        <CancelButton record={r} onCancel={cancelRegistration} />
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
        </div>
      )}
    </div>
  )
}
