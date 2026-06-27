import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"

// Event list with attendance counts (includes inactive + description). Admin or core.
export async function GET() {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const supabase = createRouteHandlerClient()
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: false })

  if (error) {
    console.error("admin events list error:", error)
    return NextResponse.json({ error: "Failed to load events." }, { status: 500 })
  }

  const withCounts = await Promise.all(
    (events ?? []).map(async (event) => {
      const { count } = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
      return { ...event, attendance_count: count ?? 0 }
    }),
  )

  return NextResponse.json({ events: withCounts })
}

// Create an event. Admin only.
export async function POST(request: Request) {
  const guard = requireRole("admin")
  if (!guard.ok) return guard.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? "").trim()
  const eventDate = typeof body.event_date === "string" ? body.event_date : ""
  if (!name || !eventDate) {
    return NextResponse.json({ error: "Event name and date are required." }, { status: 400 })
  }
  const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null

  const supabase = createRouteHandlerClient()
  const { data, error } = await supabase
    .from("events")
    .insert({ name, description, event_date: eventDate, is_active: body.is_active !== false })
    .select()
    .single()

  if (error) {
    console.error("admin event create error:", error)
    return NextResponse.json({ error: "Failed to create event." }, { status: 500 })
  }
  return NextResponse.json({ ok: true, event: data })
}
