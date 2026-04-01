"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@/lib/supabase"
import type { Event } from "@/lib/types"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, CalendarDays } from "lucide-react"

interface EventSelectorProps {
  onSelect: (eventId: string) => void
}

export function EventSelector({ onSelect }: EventSelectorProps) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchEvents() {
      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .order("event_date", { ascending: false })

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
        <Loader2 className="size-8 animate-spin text-orange-400" />
        <p className="mt-3 text-sm">Loading events...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center text-sm text-red-400">
        {error}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CalendarDays className="size-10 mb-3 text-muted-foreground/50" />
        <p className="text-sm">No active events right now.</p>
        <p className="text-xs mt-1 text-muted-foreground/70">Check back later!</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="event-select" className="text-muted-foreground">
          Select an Event
        </Label>
        <Select
          value={selectedId}
          onValueChange={(val) => setSelectedId(val as string)}
        >
          <SelectTrigger className="w-full h-12 text-base">
            <SelectValue placeholder="Choose an event..." />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name} — {event.event_date}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="gradient"
        size="lg"
        className="w-full min-h-[48px] text-base font-semibold"
        disabled={!selectedId}
        onClick={() => onSelect(selectedId)}
      >
        Continue
      </Button>
    </div>
  )
}
