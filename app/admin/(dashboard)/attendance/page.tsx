"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@/lib/supabase"
import type { Event } from "@/lib/types"
import { DataTable } from "@/components/admin/data-table"
import { Button } from "@/components/ui/button"
import { Download, Calendar, Users } from "lucide-react"
import { format } from "date-fns"

interface AttendanceRecord {
  id: string
  member_name: string
  email: string
  checked_in_at: string
}

export default function AttendancePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [recordsLoading, setRecordsLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient()
      const { data } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false })

      if (data) setEvents(data)
      setLoading(false)
    }
    load()
  }, [])

  async function selectEvent(eventId: string) {
    setSelectedEventId(eventId)
    setRecordsLoading(true)

    const supabase = createBrowserClient()
    const { data: attendanceData } = await supabase
      .from("attendance")
      .select("id, checked_in_at, member_id")
      .eq("event_id", eventId)
      .order("checked_in_at", { ascending: true })

    if (attendanceData && attendanceData.length > 0) {
      const memberIds = Array.from(new Set(attendanceData.map((a) => a.member_id)))
      const { data: membersData } = await supabase
        .from("members")
        .select("id, first_name, last_name, email")
        .in("id", memberIds)

      const memberMap = new Map(
        (membersData || []).map((m) => [m.id, { name: `${m.first_name} ${m.last_name}`, email: m.email }])
      )

      setRecords(
        attendanceData.map((a) => ({
          id: a.id,
          member_name: memberMap.get(a.member_id)?.name || "Unknown",
          email: memberMap.get(a.member_id)?.email || "",
          checked_in_at: a.checked_in_at,
        }))
      )
    } else {
      setRecords([])
    }

    setRecordsLoading(false)
  }

  function exportCsv() {
    if (!records.length || !selectedEventId) return

    const event = events.find((e) => e.id === selectedEventId)
    const header = "Name,Email,Checked In At"
    const rows = records.map(
      (r) => `"${r.member_name}","${r.email}","${format(new Date(r.checked_in_at), "yyyy-MM-dd HH:mm:ss")}"`
    )
    const csv = [header, ...rows].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `attendance-${event?.name.replace(/\s+/g, "-").toLowerCase() || "export"}-${format(new Date(), "yyyy-MM-dd")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Attendance Records</h1>
        <p className="text-sm text-muted-foreground mt-1">View and export attendance per event</p>
      </div>

      {/* Event selector */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-emerald-400/80 uppercase tracking-wider">
          Select Event
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => selectEvent(event.id)}
              className={`text-left p-3 rounded-xl border transition-all duration-200 ${
                selectedEventId === event.id
                  ? "border-emerald-500/40 bg-emerald-500/10 ring-1 ring-emerald-500/20"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
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
          <p className="text-sm text-muted-foreground">No events found.</p>
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
              <span className="flex items-center gap-1 text-sm text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full ring-1 ring-emerald-500/20">
                <Users className="size-3.5" />
                {records.length}
              </span>
            </div>
            {records.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="size-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>

          {recordsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">Loading records...</div>
            </div>
          ) : (
            <DataTable
              data={records as unknown as Record<string, unknown>[]}
              columns={[
                { key: "member_name", label: "Name", sortable: true },
                { key: "email", label: "Email", sortable: true },
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
              ]}
              searchKeys={["member_name", "email"]}
              searchPlaceholder="Search attendees..."
              emptyMessage="No one has checked in for this event yet."
            />
          )}
        </div>
      )}
    </div>
  )
}
