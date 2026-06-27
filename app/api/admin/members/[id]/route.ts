import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { MEMBER_COLUMNS } from "@/lib/supabase"

type Params = { params: { id: string } }

// Member detail + attendance history. Admin or core.
export async function GET(_request: Request, { params }: Params) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const supabase = createRouteHandlerClient()
  const { data: member, error } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("id", params.id)
    .maybeSingle()

  if (error) {
    console.error("admin member detail error:", error)
    return NextResponse.json({ error: "Failed to load member." }, { status: 500 })
  }
  if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 })

  const { data: attendance } = await supabase
    .from("attendance")
    .select("id, checked_in_at, event_id")
    .eq("member_id", params.id)
    .order("checked_in_at", { ascending: false })
    .limit(50)

  let attendanceHistory: { id: string; event_name: string; checked_in_at: string }[] = []
  const rows = attendance ?? []
  if (rows.length > 0) {
    const eventIds = Array.from(new Set(rows.map((a) => a.event_id)))
    const { data: events } = await supabase.from("events").select("id, name").in("id", eventIds)
    const eventMap = new Map((events ?? []).map((e) => [e.id, e.name]))
    attendanceHistory = rows.map((a) => ({
      id: a.id,
      event_name: eventMap.get(a.event_id) ?? "Unknown Event",
      checked_in_at: a.checked_in_at,
    }))
  }

  return NextResponse.json({ member, attendanceHistory })
}

// Mutations. Per-action role rules:
//   setGroup                          -> admin OR core
//   toggleAdmin / toggleCore / resetPin -> admin only
export async function PATCH(request: Request, { params }: Params) {
  // Must be at least a core leader.
  const base = requireRole("admin", "core")
  if (!base.ok) return base.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = typeof body.action === "string" ? body.action : ""
  const adminOnly = ["toggleAdmin", "toggleCore", "resetPin"]

  if (adminOnly.includes(action) && base.session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let patch: Record<string, unknown>
  switch (action) {
    case "toggleAdmin":
      patch = { is_admin: body.value === true }
      break
    case "toggleCore":
      patch = { is_youth_ya_core: body.value === true }
      break
    case "resetPin":
      // NOTE: still resets to the default 1234 (matches current behavior).
      // Batch 3 replaces this with a hashed, non-default reset.
      patch = { pin: "1234" }
      break
    case "setGroup":
      patch = { member_group: typeof body.group === "string" ? body.group : null }
      break
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  }

  const supabase = createRouteHandlerClient()
  const { error } = await supabase.from("members").update(patch).eq("id", params.id)
  if (error) {
    console.error(`admin member ${action} error:`, error)
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// Delete a member. Admin only. Attendance rows cascade via the FK
// (attendance_member_id_fkey ON DELETE CASCADE); the photo is removed best-effort.
export async function DELETE(_request: Request, { params }: Params) {
  const guard = requireRole("admin")
  if (!guard.ok) return guard.response

  const supabase = createRouteHandlerClient()

  const { data: member } = await supabase
    .from("members")
    .select("photo_url")
    .eq("id", params.id)
    .maybeSingle()

  if (member?.photo_url) {
    const parts = member.photo_url.split("/")
    const fileName = parts[parts.length - 1]
    if (fileName && !fileName.startsWith("http")) {
      try {
        await supabase.storage.from("member-photos").remove([fileName])
      } catch (err) {
        console.error("member photo delete failed:", err)
      }
    }
  }

  const { error } = await supabase.from("members").delete().eq("id", params.id)
  if (error) {
    console.error("admin member delete error:", error)
    return NextResponse.json({ error: "Delete failed." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
