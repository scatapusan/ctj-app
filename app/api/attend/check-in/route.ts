import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { pushAttendanceToSheets } from "@/lib/attend-sheets"

// Records an EXISTING member's attendance for an event. Idempotent: a repeat
// check-in (unique violation) is treated as success.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const eventId = typeof body.eventId === "string" ? body.eventId : ""
  const memberId = typeof body.memberId === "string" ? body.memberId : ""

  if (!eventId || !memberId) {
    return NextResponse.json({ error: "Missing member or event." }, { status: 400 })
  }

  const supabase = createRouteHandlerClient()

  const { data: member, error: memberErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("id", memberId)
    .maybeSingle()

  if (memberErr) {
    console.error("check-in member lookup error:", memberErr)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 })
  }

  const { error: insertErr } = await supabase
    .from("attendance")
    .insert({ member_id: memberId, event_id: eventId })

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ ok: true, alreadyCheckedIn: true, firstName: member.first_name })
    }
    console.error("check-in insert error:", insertErr)
    return NextResponse.json({ error: "Failed to record attendance. Please try again." }, { status: 500 })
  }

  await pushAttendanceToSheets(supabase, member, eventId)

  return NextResponse.json({ ok: true, firstName: member.first_name })
}
