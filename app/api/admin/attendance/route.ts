import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { PHOTO_BUCKET, isLegacyAbsoluteUrl } from "@/lib/photos"

// Attendance records for one event (enriched with member name/email). Admin or core.
export async function GET(request: Request) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const eventId = new URL(request.url).searchParams.get("eventId")
  if (!eventId) return NextResponse.json({ records: [] })

  const supabase = createRouteHandlerClient()
  const { data: attendance, error } = await supabase
    .from("attendance")
    .select("id, checked_in_at, member_id, status, attended_at, category, is_core")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: true })

  if (error) {
    console.error("admin attendance error:", error)
    return NextResponse.json({ error: "Failed to load attendance." }, { status: 500 })
  }

  let records: {
    id: string
    member_name: string
    email: string
    checked_in_at: string
    status: string
    attended_at: string | null
    category: string | null
    is_core: boolean
  }[] = []
  const rows = attendance ?? []
  if (rows.length > 0) {
    const memberIds = Array.from(new Set(rows.map((a) => a.member_id)))
    const { data: members } = await supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .in("id", memberIds)
    const memberMap = new Map(
      (members ?? []).map((m) => [m.id, { name: `${m.first_name} ${m.last_name}`, email: m.email }]),
    )
    records = rows.map((a) => ({
      id: a.id,
      member_name: memberMap.get(a.member_id)?.name ?? "Unknown",
      email: memberMap.get(a.member_id)?.email ?? "",
      checked_in_at: a.checked_in_at,
      // Defaults cover rows read before the matching migration is applied.
      status: (a as { status?: string }).status ?? "attended",
      attended_at: (a as { attended_at?: string | null }).attended_at ?? null,
      category: (a as { category?: string | null }).category ?? null,
      is_core: (a as { is_core?: boolean }).is_core === true,
    }))
  }

  return NextResponse.json({ records })
}

// Correct a registrant's category label (Youth / YA / Core) on ONE attendance
// row. Admin or core — this is registration data, not a privilege change, and
// with Core now self-selected on the form this is the correction path.
//   'youth' | 'ya' -> sets the age bracket and clears the Core label
//   'core'         -> sets the Core label, KEEPING the stored age bracket
// Never touches the members table (is_youth_ya_core stays the admin-only
// toggleCore action on /api/admin/members/[id]).
export async function PATCH(request: Request) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === "string" ? body.id : ""
  const category = typeof body.category === "string" ? body.category : ""

  if (!id) return NextResponse.json({ error: "Missing attendance id." }, { status: 400 })
  if (!["youth", "ya", "core"].includes(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 })
  }

  const patch =
    category === "core" ? { is_core: true } : { category, is_core: false }

  const supabase = createRouteHandlerClient()
  const { data, error } = await supabase
    .from("attendance")
    .update(patch)
    .eq("id", id)
    .select("id, category, is_core")
    .maybeSingle()

  if (error) {
    console.error("admin attendance category error:", error)
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Attendance row not found." }, { status: 404 })

  return NextResponse.json({ ok: true, record: data })
}

// Cancel/remove ONE registration (pre-registered or attended). Admin only:
// this is irreversible and matches the member-delete precedent, whereas the
// category correction above is a label fix any core leader may make.
//
// The member record is untouched — only their registration for this event goes
// away, which also frees the (member_id, event_id) unique constraint so they
// can register again if they change their mind. Their baby photo is removed
// best-effort: they cancelled, so we should not keep their childhood photo.
export async function DELETE(request: Request) {
  const guard = requireRole("admin")
  if (!guard.ok) return guard.response

  const url = new URL(request.url)
  let id = url.searchParams.get("id") ?? ""
  if (!id) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    id = typeof body.id === "string" ? body.id : ""
  }
  if (!id) return NextResponse.json({ error: "Missing attendance id." }, { status: 400 })

  const supabase = createRouteHandlerClient()

  const { data: row } = await supabase
    .from("attendance")
    .select("id, baby_photo_url")
    .eq("id", id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "Registration not found." }, { status: 404 })

  const { error } = await supabase.from("attendance").delete().eq("id", id)
  if (error) {
    console.error("admin attendance delete error:", error)
    return NextResponse.json({ error: "Couldn't cancel this registration." }, { status: 500 })
  }

  // Best-effort, after the row is gone: a storage hiccup must not resurrect a
  // cancellation the admin already confirmed.
  const stored = row.baby_photo_url as string | null
  if (stored && !isLegacyAbsoluteUrl(stored)) {
    try {
      await supabase.storage.from(PHOTO_BUCKET).remove([stored])
    } catch (err) {
      console.error("baby photo delete failed:", err)
    }
  }

  return NextResponse.json({ ok: true })
}
