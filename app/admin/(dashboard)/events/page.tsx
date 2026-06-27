"use client"

import { useEffect, useState } from "react"
import { useRole } from "@/components/admin/role-provider"
import type { Event } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { QrModal } from "@/components/admin/qr-modal"
import { ListSkeleton } from "@/components/admin/list-skeleton"
import {
  Plus,
  QrCode,
  Pencil,
  Trash2,
  Loader2,
  X,
  Save,
  Calendar,
} from "lucide-react"
import { format } from "date-fns"
import { toast } from "@/lib/toast"

export default function EventsPage() {
  const { isSuperadmin } = useRole()
  const [events, setEvents] = useState<(Event & { attendance_count: number })[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formDate, setFormDate] = useState("")
  const [formActive, setFormActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // QR modal
  const [qrEvent, setQrEvent] = useState<Event | null>(null)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const baseUrl = typeof window !== "undefined" ? window.location.origin : ""

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    try {
      const res = await fetch("/api/admin/events")
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events)
      }
    } catch {
      // leave existing on error
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditingId(null)
    setFormName("")
    setFormDescription("")
    setFormDate(new Date().toISOString().split("T")[0])
    setFormActive(true)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(event: Event) {
    setEditingId(event.id)
    setFormName(event.name)
    setFormDescription(event.description || "")
    setFormDate(event.event_date.split("T")[0])
    setFormActive(event.is_active)
    setFormError(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formName.trim()) {
      setFormError("Event name is required.")
      return
    }
    if (!formDate) {
      setFormError("Event date is required.")
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      event_date: formDate,
      is_active: formActive,
    }

    try {
      const res = editingId
        ? await fetch(`/api/admin/events/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })

      if (!res.ok) {
        setFormError(editingId ? "Failed to update event." : "Failed to create event.")
        toast.error(editingId ? "Couldn't update event" : "Couldn't create event")
        setSaving(false)
        return
      }
      toast.success(editingId ? "Event updated" : "Event created")
    } catch {
      setFormError("Network error. Please try again.")
      setSaving(false)
      return
    }

    setSaving(false)
    setShowForm(false)
    loadEvents()
  }

  async function handleDelete(id: string) {
    // Attendance rows cascade via the FK (attendance_event_id_fkey ON DELETE CASCADE).
    try {
      const res = await fetch(`/api/admin/events/${id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Couldn't delete event", {
          action: { label: "Retry", onClick: () => handleDelete(id) },
        })
        return
      }
    } catch {
      toast.error("Network error", {
        action: { label: "Retry", onClick: () => handleDelete(id) },
      })
      return
    }
    toast.success("Event deleted")
    setDeletingId(null)
    loadEvents()
  }

  if (loading) {
    return <ListSkeleton rows={5} showSearch={false} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage events and generate QR codes</p>
        </div>
        {isSuperadmin && (
          <Button variant="gradient" onClick={openCreate}>
            <Plus className="size-4 mr-2" />
            Create Event
          </Button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wider">
              {editingId ? "Edit Event" : "New Event"}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-name" className="text-muted-foreground">
                Event Name <span className="text-orange-400 font-bold">*</span>
              </Label>
              <Input
                id="event-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Sunday Youth Fellowship"
                className="h-11"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-date" className="text-muted-foreground">
                Date <span className="text-orange-400 font-bold">*</span>
              </Label>
              <Input
                id="event-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-11"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-description" className="text-muted-foreground">Description</Label>
            <Textarea
              id="event-description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Optional description"
              className="text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch id="event-active" checked={formActive} onCheckedChange={setFormActive} />
            <Label htmlFor="event-active" className="text-sm text-foreground/80 cursor-pointer">
              Active (visible to attendees)
            </Label>
          </div>

          {formError && (
            <p className="text-sm text-red-400">{formError}</p>
          )}

          <Button variant="gradient" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            {editingId ? "Update Event" : "Create Event"}
          </Button>
        </div>
      )}

      {/* Events list */}
      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center text-muted-foreground">
            No events yet. Create your first event!
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground truncate">{event.name}</h3>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      event.is_active
                        ? "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20"
                        : "bg-white/[0.04] text-muted-foreground ring-1 ring-white/[0.08]"
                    }`}
                  >
                    {event.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {format(new Date(event.event_date), "MMM d, yyyy")}
                  </span>
                  <span>{event.attendance_count} checked in</span>
                </div>
                {event.description && (
                  <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1">
                    {event.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQrEvent(event)}
                  title="QR Code"
                >
                  <QrCode className="size-4" />
                </Button>
                {isSuperadmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(event)}
                    title="Edit"
                  >
                    <Pencil className="size-4" />
                  </Button>
                )}

                {isSuperadmin && (
                  deletingId === event.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 text-xs"
                        onClick={() => handleDelete(event.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-red-400"
                      onClick={() => setDeletingId(event.id)}
                      title="Delete"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* QR Modal */}
      {qrEvent && (
        <QrModal
          eventName={qrEvent.name}
          eventId={qrEvent.id}
          baseUrl={baseUrl}
          onClose={() => setQrEvent(null)}
        />
      )}
    </div>
  )
}
