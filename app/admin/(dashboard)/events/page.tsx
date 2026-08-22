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
import { useConfirm } from "@/components/admin/confirm-dialog"

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
  const [formRetreat, setFormRetreat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // QR modal
  const [qrEvent, setQrEvent] = useState<Event | null>(null)

  // Delete confirmation
  const { confirm, confirmDialog } = useConfirm()

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
    setFormRetreat(false)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(event: Event) {
    setEditingId(event.id)
    setFormName(event.name)
    setFormDescription(event.description || "")
    setFormDate(event.event_date.split("T")[0])
    setFormActive(event.is_active)
    setFormRetreat(event.registration_mode === "retreat")
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
      registration_mode: formRetreat ? "retreat" : "checkin",
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

  async function handleDelete(event: Event) {
    // Attendance rows cascade via the FK (attendance_event_id_fkey ON DELETE
    // CASCADE), so this is the single most destructive action in the console:
    // every registration for the event, including the retreat's guardian
    // contacts and baby photos, goes with it. The dialog says so, and says how
    // many, because the list already knows the count.
    const registered = (event as { attendance_count?: number }).attendance_count ?? 0
    const confirmed = await confirm({
      title: `Permanently delete "${event.name}"?`,
      body: (
        <>
          <p>
            This also deletes{" "}
            <strong className="text-foreground">
              {registered === 0
                ? "every registration and attendance record for it"
                : `all ${registered} registration${registered === 1 ? "" : "s"} for it`}
            </strong>
            , including the answers people gave on the retreat form — birthdays, addresses,
            guardian contacts and baby photos.
          </p>
          <p className="mt-2">Nothing in the console can bring any of it back.</p>
        </>
      ),
      confirmLabel: "Delete event and registrations",
      cancelLabel: "Keep event",
      tone: "destructive",
    })
    if (!confirmed) return

    try {
      const res = await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" })
      if (!res.ok) {
        // No Retry action: one tap from a toast must not re-fire a cascading
        // delete without passing the dialog again.
        toast.error("Couldn't delete event. Try again from the list.")
        return
      }
    } catch {
      toast.error("Network error. The event was not deleted.")
      return
    }
    toast.success("Event deleted")
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
            <h2 className="text-sm font-semibold text-accent/80 uppercase tracking-wider">
              {editingId ? "Edit Event" : "New Event"}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-name" className="text-muted-foreground">
                Event Name <span className="text-accent font-bold">*</span>
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
                Date <span className="text-accent font-bold">*</span>
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

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch id="event-retreat" checked={formRetreat} onCheckedChange={setFormRetreat} />
              <Label htmlFor="event-retreat" className="text-sm text-foreground/80 cursor-pointer">
                Retreat-style (pre-register first)
              </Label>
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              {formRetreat
                ? "People sign up ahead at /retreat (category, guardian, baby photo). They are NOT marked present until a leader marks them on Check-in day. Hidden from the normal check-in picker."
                : "Normal event: people check themselves in at /attend and are marked present immediately."}
            </p>
          </div>

          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
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
                        ? "bg-secondary text-accent ring-1 ring-foreground"
                        : "bg-card text-muted-foreground ring-1 ring-border/40"
                    }`}
                  >
                    {event.is_active ? "Active" : "Inactive"}
                  </span>
                  {event.registration_mode === "retreat" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-muted text-muted-foreground ring-1 ring-border">
                      Pre-register
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {format(new Date(event.event_date), "MMM d, yyyy")}
                  </span>
                  <span>{event.attendance_count} checked in</span>
                </div>
                {event.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
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

                {/* One button, one dialog. The old two-step rendered "Confirm"
                    where the trash icon had just been, so two taps in the same
                    place deleted an event and every registration for it. */}
                {isSuperadmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(event)}
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {confirmDialog}

      {/* QR Modal */}
      {qrEvent && (
        <QrModal
          eventName={qrEvent.name}
          eventId={qrEvent.id}
          baseUrl={baseUrl}
          defaultMode={qrEvent.registration_mode === "retreat" ? "preregister" : "checkin"}
          onClose={() => setQrEvent(null)}
        />
      )}
    </div>
  )
}
