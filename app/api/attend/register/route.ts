import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { pushRegistrationToSheets } from "@/lib/attend-sheets"
import { toStoredPhotoValue } from "@/lib/photos"
import type { Member } from "@/lib/types"

// Fields a PUBLIC registrant may set. Privilege flags (is_admin,
// is_youth_ya_core) are deliberately excluded here AND in the RPC, so a
// self-registrant can never grant themselves admin/core access.
const ALLOWED_FIELDS = [
  "first_name", "middle_name", "last_name", "nickname", "gender", "birthdate",
  "contact_number", "facebook_link", "address", "occupation", "father_name", "mother_name",
  "emergency_contact_name", "emergency_contact_number", "discipler_name", "disciples",
  "prospect_disciples", "lifeline_leader", "lifeline_co_leaders", "lifeline_members",
  "ministry_involvements", "completed_reach", "completed_fresh_start", "completed_freedom_day",
  "completed_grand_day", "baptized_in_water", "photo_url", "pin",
] as const

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const eventId = typeof body.eventId === "string" ? body.eventId : ""
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const input = (body.member ?? {}) as Record<string, unknown>

  if (!eventId) return NextResponse.json({ error: "Missing event." }, { status: 400 })
  if (!email || !isValidEmail(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 })
  if (!String(input.first_name ?? "").trim() || !String(input.last_name ?? "").trim()) {
    return NextResponse.json({ error: "First and last name are required." }, { status: 400 })
  }
  if (body.privacyConsent !== true) {
    return NextResponse.json({ error: "Privacy consent is required." }, { status: 400 })
  }

  const member: Record<string, unknown> = { email, is_guest: false }
  for (const k of ALLOWED_FIELDS) {
    if (input[k] !== undefined && input[k] !== null) member[k] = input[k]
  }
  if (member.photo_url) member.photo_url = toStoredPhotoValue(member.photo_url as string)

  const supabase = createRouteHandlerClient()
  const { data, error } = await supabase.rpc("register_and_checkin", {
    p_member: member,
    p_event_id: eventId,
  })

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This email is already registered." }, { status: 409 })
    }
    console.error("register_and_checkin error:", error)
    return NextResponse.json({ error: "Failed to register. Please try again." }, { status: 500 })
  }

  const created = (Array.isArray(data) ? data[0] : data) as Member
  await pushRegistrationToSheets(supabase, created, eventId)

  return NextResponse.json({ ok: true, memberId: created.id, firstName: created.first_name })
}
