import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"

type Params = { params: { id: string } }

// Edit an event. Admin only.
export async function PATCH(request: Request, { params }: Params) {
  const guard = requireRole("admin")
  if (!guard.ok) return guard.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if ("description" in body) {
    patch.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null
  }
  if (typeof body.event_date === "string") patch.event_date = body.event_date
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active
  if (body.registration_mode === "checkin" || body.registration_mode === "retreat") {
    patch.registration_mode = body.registration_mode
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
  }

  const supabase = createRouteHandlerClient()
  const { error } = await supabase.from("events").update(patch).eq("id", params.id)
  if (error) {
    console.error("admin event update error:", error)
    return NextResponse.json({ error: "Failed to update event." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// Delete an event. Admin only. Attendance rows cascade via the FK
// (attendance_event_id_fkey ON DELETE CASCADE).
export async function DELETE(_request: Request, { params }: Params) {
  const guard = requireRole("admin")
  if (!guard.ok) return guard.response

  const supabase = createRouteHandlerClient()
  const { error } = await supabase.from("events").delete().eq("id", params.id)
  if (error) {
    console.error("admin event delete error:", error)
    return NextResponse.json({ error: "Failed to delete event." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
