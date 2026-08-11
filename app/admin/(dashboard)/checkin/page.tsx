"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { Event } from "@/lib/types"
import { toast } from "@/lib/toast"
import { ListSkeleton } from "@/components/admin/list-skeleton"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Search, UserPlus, CheckCircle2, Check, X } from "lucide-react"
import { format } from "date-fns"

interface RosterRow {
  attendanceId: string
  memberId: string
  name: string
  nickname: string | null
  isGuest: boolean
  status: "registered" | "attended"
  checkedInAt: string
  attendedAt: string | null
  category: "youth" | "ya" | null
  /** Short-lived signed URL — the bucket is private. */
  babyPhotoUrl: string | null
  hasGuardian: boolean
}

export default function CheckinPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [marking, setMarking] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/events")
        if (res.ok) {
          const data = await res.json()
          setEvents((data.events as Event[]).filter((e) => e.is_active))
        }
      } catch {
        // leave empty on error
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function loadRoster(eventId: string) {
    setSelectedEventId(eventId)
    setRosterLoading(true)
    try {
      const res = await fetch(`/api/admin/checkin?eventId=${encodeURIComponent(eventId)}`)
      if (res.ok) {
        const data = await res.json()
        setRoster(data.roster as RosterRow[])
      } else {
        setRoster([])
        toast.error("Failed to load the roster.")
      }
    } catch {
      setRoster([])
      toast.error("Network error loading the roster.")
    } finally {
      setRosterLoading(false)
    }
  }

  async function markAttended(row: RosterRow) {
    setMarking(row.attendanceId)
    try {
      const res = await fetch("/api/admin/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceId: row.attendanceId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "Failed to mark attendance.")
        return
      }
      setRoster((prev) =>
        prev.map((r) =>
          r.attendanceId === row.attendanceId
            ? { ...r, status: "attended", attendedAt: data.attendedAt ?? new Date().toISOString() }
            : r,
        ),
      )
      toast.success(`${row.name} marked attended`)
    } catch {
      toast.error("Network error. Please try again.")
    } finally {
      setMarking(null)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return roster
    return roster.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.nickname ?? "").toLowerCase().includes(q),
    )
  }, [roster, query])

  const preRegistered = filtered.filter((r) => r.status === "registered")
  const attended = filtered.filter((r) => r.status === "attended")
  const totalAttended = roster.filter((r) => r.status === "attended").length

  const selectedEvent = events.find((e) => e.id === selectedEventId)

  if (loading) return <ListSkeleton rows={5} showSearch={false} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Event Check-in</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mark pre-registered people as they arrive; walk-ins register at the door.
        </p>
      </div>

      {/* Event selector */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Select Event</h2>
        {events.length === 0 ? (
          <p className="text-sm font-medium text-muted-foreground">No active events.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => loadRoster(event.id)}
                className={`text-left p-3 rounded-xl border-2 transition-all duration-200 ${
                  selectedEventId === event.id
                    ? "border-foreground bg-secondary shadow-pop-sm"
                    : "border-border bg-card hover:border-foreground"
                }`}
              >
                <p className="font-bold text-sm text-foreground truncate">{event.name}</p>
                <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                  {format(new Date(`${event.event_date}T00:00:00`), "MMM d, yyyy")}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedEventId && (
        <>
          {/* Count + walk-in + search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-primary border-2 border-foreground px-4 py-2 text-sm font-bold text-foreground">
              {totalAttended} / {roster.length} attended
            </div>
            <Link href={`/retreat?event=${selectedEventId}&walkin=1`} target="_blank">
              <Button variant="outline" size="sm" className="min-h-[40px]">
                <UserPlus className="size-4 mr-2" />
                Walk-in registration
              </Button>
            </Link>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or nickname..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 pl-10 text-base"
            />
          </div>

          {rosterLoading ? (
            <ListSkeleton rows={4} showSearch={false} />
          ) : (
            <div className="space-y-6">
              {/* Pre-registered — the working list */}
              <section className="space-y-3">
                <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">
                  Pre-registered ({preRegistered.length})
                </h2>
                {preRegistered.length === 0 ? (
                  <p className="text-sm font-medium text-muted-foreground">
                    {roster.length === 0
                      ? "Nobody on the list yet for this event."
                      : query
                        ? "No pre-registered match for that search."
                        : "Everyone pre-registered has been marked — nice!"}
                  </p>
                ) : (
                  preRegistered.map((row) => (
                    <div
                      key={row.attendanceId}
                      className="glass rounded-xl p-4 flex items-center justify-between gap-3"
                    >
                      {row.babyPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setLightbox({ url: row.babyPhotoUrl!, name: row.name })}
                          className="shrink-0 rounded-lg overflow-hidden border-2 border-foreground hover:opacity-80 transition-opacity"
                          aria-label={`View ${row.name}'s baby photo`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={row.babyPhotoUrl} alt="" className="w-12 h-12 object-cover" />
                        </button>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">
                          {row.name}
                          {row.nickname && (
                            <span className="font-semibold text-muted-foreground"> · {row.nickname}</span>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {row.category && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-secondary text-foreground ring-1 ring-border">
                              {row.category === "youth" ? "Youth" : "YA"}
                            </span>
                          )}
                          {row.hasGuardian && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-muted text-muted-foreground ring-1 ring-border">
                              Guardian on file
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="min-h-[44px] shrink-0"
                        onClick={() => markAttended(row)}
                        disabled={marking === row.attendanceId}
                      >
                        {marking === row.attendanceId ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="size-4 mr-1.5" strokeWidth={3} />
                            Mark attended
                          </>
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </section>

              {/* Attended */}
              <section className="space-y-3">
                <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">
                  Attended ({attended.length})
                </h2>
                {attended.length === 0 ? (
                  <p className="text-sm font-medium text-muted-foreground">Nobody marked yet.</p>
                ) : (
                  attended.map((row) => (
                    <div
                      key={row.attendanceId}
                      className="rounded-xl border-2 border-border bg-muted/50 p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">
                          {row.name}
                          {row.nickname && (
                            <span className="font-semibold text-muted-foreground"> · {row.nickname}</span>
                          )}
                        </p>
                        <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                          {row.attendedAt
                            ? `Attended ${format(new Date(row.attendedAt), "h:mm a")}`
                            : "Attended"}
                        </p>
                      </div>
                      <span className="shrink-0 w-8 h-8 rounded-full bg-primary border-2 border-foreground flex items-center justify-center">
                        <CheckCircle2 className="size-4 text-foreground" />
                      </span>
                    </div>
                  ))
                )}
              </section>
            </div>
          )}

          {/* Baby photo lightbox */}
          {lightbox && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-foreground/50" onClick={() => setLightbox(null)} />
              <div className="relative glass rounded-2xl p-4 max-w-sm w-full space-y-3">
                <button
                  onClick={() => setLightbox(null)}
                  className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
                <p className="text-sm font-extrabold text-foreground pr-8">{lightbox.name}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightbox.url}
                  alt={`${lightbox.name} as a child`}
                  className="w-full rounded-xl border-2 border-foreground"
                />
                <p className="text-[11px] font-medium text-muted-foreground">
                  Private photo — this link expires shortly and is not shareable.
                </p>
              </div>
            </div>
          )}

          {selectedEvent && (
            <p className="text-xs font-medium text-muted-foreground">
              Marking is one-way here — if something was marked by mistake, fix it
              from the database or ask the developer. Records made earlier are
              never modified by marking someone else.
            </p>
          )}
        </>
      )}
    </div>
  )
}
