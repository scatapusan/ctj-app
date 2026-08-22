import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { pushAttendanceToSheets } from "@/lib/attend-sheets"
import { signPhotos, babyPhotoObjectPath } from "@/lib/photos"

// Staff day-of check-in (admin or core).
//
// GET    ?eventId=...          -> full roster for the event: pre-registered AND
//                                 attended rows, with member names for search.
// POST   { attendanceId }      -> mark a pre-registered row attended: flips
//                                 status and stamps attended_at. Idempotent —
//                                 marking an already-attended row is a no-op
//                                 success. Touches ONLY that row, and only the
//                                 status/attended_at columns.
// DELETE ?attendanceId=...     -> the reverse: put an attended row back to
//                                 pre-registered. Also idempotent, also touches
//                                 only those two columns.
//
// Marking used to be one-way, which made a mis-tap at the door permanent —
// the roster reflows the moment a row is marked, so the next name slides up
// under the finger. The reverse is deliberately the SAME role as marking
// (admin or core): the person who needs to fix a mis-tap is the leader who
// made it, mid-queue, and sending them to find an admin is how a wrong record
// becomes a permanent one.
//
// What this does NOT undo: marking attended appends a line to the Google
// Sheets Attendance tab (below), and the Sheets integration has no per-row
// delete. That line survives until someone runs the full sync from the
// dashboard, which clears and rewrites the tab from the database.

export async function GET(request: Request) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const url = new URL(request.url)
  const eventId = url.searchParams.get("eventId") ?? ""
  if (!eventId) return NextResponse.json({ error: "Missing event." }, { status: 400 })

  const supabase = createRouteHandlerClient()

  const { data: rows, error } = await supabase
    .from("attendance")
    .select("id, member_id, status, checked_in_at, attended_at, category, is_core, baby_photo_url, guardian_name, guardian_contact")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: true })

  if (error) {
    console.error("checkin roster error:", error)
    return NextResponse.json({ error: "Failed to load the roster." }, { status: 500 })
  }

  const list = rows ?? []
  let roster: unknown[] = []
  if (list.length > 0) {
    const memberIds = Array.from(new Set(list.map((r) => r.member_id)))
    const { data: members } = await supabase
      .from("members")
      .select("id, first_name, last_name, nickname, is_guest")
      .in("id", memberIds)
    const memberMap = new Map((members ?? []).map((m) => [m.id, m]))
    // Baby photos live in a private bucket — sign them for signed-in staff only,
    // and only when the stored value really is one of our objects.
    const signed = await signPhotos(
      supabase,
      list.map((r) => babyPhotoObjectPath(r.baby_photo_url as string | null)),
    )
    roster = list.map((r) => {
      const m = memberMap.get(r.member_id)
      return {
        attendanceId: r.id,
        memberId: r.member_id,
        name: m ? `${m.first_name} ${m.last_name}` : "Unknown",
        nickname: m?.nickname ?? null,
        isGuest: m?.is_guest ?? false,
        status: r.status,
        checkedInAt: r.checked_in_at,
        attendedAt: r.attended_at,
        category: r.category,
        isCore: r.is_core === true,
        babyPhotoUrl: (() => {
          const path = babyPhotoObjectPath(r.baby_photo_url as string | null)
          return path ? (signed.get(path) ?? null) : null
        })(),
        hasGuardian: !!r.guardian_name,
      }
    })
  }

  return NextResponse.json({ roster })
}

export async function DELETE(request: Request) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const attendanceId = new URL(request.url).searchParams.get("attendanceId") ?? ""
  if (!attendanceId) return NextResponse.json({ error: "Missing attendance id." }, { status: 400 })

  const supabase = createRouteHandlerClient()

  const { data: row, error: readErr } = await supabase
    .from("attendance")
    .select("id, status")
    .eq("id", attendanceId)
    .maybeSingle()

  if (readErr) {
    console.error("un-attend read error:", readErr)
    return NextResponse.json({ error: "Failed to update. Please try again." }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: "Record not found." }, { status: 404 })

  // Idempotent, mirroring POST: already pre-registered is success, nothing written.
  if (row.status !== "attended") {
    return NextResponse.json({ ok: true, alreadyRegistered: true })
  }

  // attended_at is NOT set here. The attendance_sync_attended_at trigger
  // (20260808060000_retreat_event_mode.sql) nulls it whenever status becomes
  // 'registered', so the invariant holds even if this route is bypassed.
  const { error: updErr } = await supabase
    .from("attendance")
    .update({ status: "registered", attended_at: null })
    .eq("id", attendanceId)
    .eq("status", "attended")

  if (updErr) {
    console.error("un-attend update error:", updErr)
    return NextResponse.json({ error: "Failed to update. Please try again." }, { status: 500 })
  }

  // The registration itself is untouched: the person stays on the event's list,
  // keeps their category, guardian details and baby photo, and can be marked
  // attended again. Removing someone from the event entirely is a different,
  // admin-only action on /api/admin/attendance.
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const attendanceId = typeof body.attendanceId === "string" ? body.attendanceId : ""
  if (!attendanceId) return NextResponse.json({ error: "Missing attendance id." }, { status: 400 })

  const supabase = createRouteHandlerClient()

  const { data: row, error: readErr } = await supabase
    .from("attendance")
    .select("id, member_id, event_id, status")
    .eq("id", attendanceId)
    .maybeSingle()

  if (readErr) {
    console.error("mark-attended read error:", readErr)
    return NextResponse.json({ error: "Failed to update. Please try again." }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: "Record not found." }, { status: 404 })

  // Idempotent: already attended is success, nothing rewritten.
  if (row.status === "attended") {
    return NextResponse.json({ ok: true, alreadyAttended: true })
  }

  const attendedAt = new Date().toISOString()
  const { error: updErr } = await supabase
    .from("attendance")
    .update({ status: "attended", attended_at: attendedAt })
    .eq("id", attendanceId)
    .eq("status", "registered")

  if (updErr) {
    console.error("mark-attended update error:", updErr)
    return NextResponse.json({ error: "Failed to update. Please try again." }, { status: 500 })
  }

  // Best-effort Sheets attendance line — this is the moment they actually attended.
  const { data: member } = await supabase
    .from("members")
    .select("first_name, last_name, email")
    .eq("id", row.member_id)
    .maybeSingle()
  if (member) await pushAttendanceToSheets(supabase, member, row.event_id)

  return NextResponse.json({ ok: true, attendedAt })
}
