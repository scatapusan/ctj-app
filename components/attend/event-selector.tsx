"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@/lib/supabase"
import type { Event } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Loader2, CalendarDays, Check } from "lucide-react"

interface EventSelectorProps {
  onSelect: (eventId: string, eventName: string) => void
  /** Optional walk-in/first-timer path: called with the chosen event. */
  onGuest?: (eventId: string) => void
}

const FILIPINO_DAYS = [
  "Linggo",
  "Lunes",
  "Martes",
  "Miyerkules",
  "Huwebes",
  "Biyernes",
  "Sabado",
]

function eventDateLine(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d.getTime())) return dateStr
  const day = FILIPINO_DAYS[d.getDay()]
  const today = new Date()
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return isToday ? `Today · ${day}` : `${md} · ${day}`
}

export function EventSelector({ onSelect, onGuest }: EventSelectorProps) {
  const [events, setEvents] = useState<Pick<Event, "id" | "name" | "event_date" | "is_active">[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [needsChoice, setNeedsChoice] = useState(false)

  useEffect(() => {
    async function fetchEvents() {
      const supabase = createBrowserClient()
      // Only non-sensitive, anon-readable columns (description is excluded by
      // the RLS lockdown's column grant).
      //
      // Retreat-mode events are deliberately NOT offered here: they use the
      // /retreat pre-registration flow, and checking into one from this picker
      // would mark someone attended without any of the retreat details.
      const modeAware = await supabase
        .from("events")
        .select("id, name, event_date, is_active")
        .eq("is_active", true)
        .eq("registration_mode", "checkin")
        .order("event_date", { ascending: false })

      // Falls back when registration_mode has not been migrated yet, so a
      // deploy that lands before the migration degrades to the old list
      // instead of breaking check-in entirely.
      const { data, error } = modeAware.error
        ? await supabase
            .from("events")
            .select("id, name, event_date, is_active")
            .eq("is_active", true)
            .order("event_date", { ascending: false })
        : modeAware

      if (error) {
        setError("Failed to load events. Please try again.")
        console.error(error)
      } else {
        setEvents(data || [])
      }
      setLoading(false)
    }
    fetchEvents()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-foreground" />
        <p className="mt-3 text-sm font-medium">Loading events...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-center text-sm font-semibold text-destructive">
        {error}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CalendarDays className="size-10 mb-3" />
        <p className="text-sm font-semibold">No active events right now.</p>
        <p className="text-xs mt-1">Check back later!</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-extrabold leading-tight text-foreground">
        Which event are you here for?
      </h2>

      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Select an event">
        {events.map((event) => {
          const selected = event.id === selectedId
          return (
            <button
              key={event.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => { setSelectedId(event.id); setNeedsChoice(false) }}
              className={
                selected
                  ? "min-h-[64px] rounded-2xl bg-secondary border-[2.5px] border-foreground shadow-pop px-4 py-3 flex items-center justify-between text-left transition-all"
                  : "min-h-[64px] rounded-2xl bg-card border-2 border-foreground px-4 py-3 flex items-center justify-between text-left transition-all hover:bg-secondary/50"
              }
            >
              <div>
                <div className={`text-base ${selected ? "font-extrabold" : "font-bold"} text-foreground`}>
                  {event.name}
                </div>
                <div className="text-[13px] font-semibold text-muted-foreground mt-0.5">
                  {eventDateLine(event.event_date)}
                </div>
              </div>
              {selected && (
                <span className="w-[26px] h-[26px] shrink-0 rounded-full bg-foreground text-primary flex items-center justify-center">
                  <Check className="size-4" strokeWidth={3.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {needsChoice && (
        <p className="text-sm font-semibold text-destructive text-center" role="alert">
          Pick an event first, then tap Continue.
        </p>
      )}

      <Button
        size="lg"
        className="w-full min-h-[52px] text-lg"
        disabled={!selectedId}
        onClick={() => onSelect(selectedId, events.find((e) => e.id === selectedId)?.name ?? "")}
      >
        Continue
      </Button>

      {onGuest && (
        <button
          type="button"
          className="w-full min-h-[44px] text-center text-sm font-bold text-accent underline underline-offset-[3px] hover:text-accent/80"
          onClick={() => {
            if (!selectedId) {
              setNeedsChoice(true)
              return
            }
            onGuest(selectedId)
          }}
        >
          First time or walk-in guest? Start here
        </button>
      )}
    </div>
  )
}
