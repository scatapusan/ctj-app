import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { syncMemberToSheet } from "@/lib/google-sheets"
import { pushRegistrationToSheets, pushAttendanceToSheets } from "@/lib/attend-sheets"
import { toStoredPhotoValue } from "@/lib/photos"
import type { Member } from "@/lib/types"

// Retreat registration. Default is PRE-registration (status='registered' —
// NOT a check-in); `walkIn: true` is the day-of path and inserts directly as
// 'attended' (equivalent trust level to the existing public check-in flow).
//
// Two shapes, both rate-limited:
//   * New person:      { eventId, email, member: {...}, retreat: {...}, privacyConsent, walkIn? }
//   * Existing member: { eventId, memberId, retreat: {...}, walkIn? }  (attendance row
//     only — no member-profile writes without a PIN)
//
// `retreat` carries the event-scoped answers; validation rules:
//   * birthdate is REQUIRED for new people (category depends on it)
//   * category must be 'youth' or 'ya' (the age bracket — 'core' is NOT a
//     category; it's the separate is_core flag below)
//   * is_core: self-declared registration label, stored on the ATTENDANCE row
//     only. It is prefilled client-side from the roster but the registrant's
//     choice wins (the roster is stale); admins correct mistakes in the
//     console. It NEVER writes members.is_youth_ya_core or any privilege.
//   * category 'ya' (and not core) -> baby_photo_url REQUIRED. Core registrants
//     MAY send one (they join the game) but are never blocked for lacking it.
//   * age under 18   -> guardian name + contact REQUIRED

// Fields a PUBLIC registrant may set (subset of the main registration form —
// the retreat form is deliberately short). Privilege flags are excluded here
// AND in the RPC.
const ALLOWED_MEMBER_FIELDS = [
  "first_name", "last_name", "nickname", "birthdate", "address", "contact_number",
] as const

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function ageOn(dateStr: string, on: Date): number | null {
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d.getTime())) return null
  let age = on.getFullYear() - d.getFullYear()
  const m = on.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) age--
  return age
}

interface RetreatMeta {
  category: string
  /** Self-declared Core label — attendance-row data, never a member privilege. */
  is_core: boolean
  baby_photo_url: string | null
  guardian_name: string | null
  guardian_contact: string | null
}

/** Validate the retreat block against the birthdate. Returns meta or an error string. */
function validateRetreat(input: Record<string, unknown>, birthdate: string): RetreatMeta | string {
  const age = ageOn(birthdate, new Date())
  if (age === null) return "Please enter a valid birthday."
  if (age < 12) return "The retreat is for ages 12 and up — please ask a leader to help you register."
  if (age > 100) return "Please enter a valid birthday."

  // The age bracket. 'core' is deliberately NOT accepted here — Core rides on
  // the is_core flag so the bracket dimension is never lost.
  const category = typeof input.category === "string" ? input.category : ""
  if (category !== "youth" && category !== "ya") return "Please choose your category."

  const isCore = input.is_core === true

  const babyPhotoUrl =
    typeof input.baby_photo_url === "string" && input.baby_photo_url
      ? toStoredPhotoValue(input.baby_photo_url)
      : null
  // The baby photo is required for YA. Core registrants get the same picker
  // (optional) — whatever they upload is stored either way, just not enforced.
  if (category === "ya" && !isCore && !babyPhotoUrl) {
    return "YA/Singles registration needs a baby or childhood photo."
  }

  const guardianName = typeof input.guardian_name === "string" ? input.guardian_name.trim() : ""
  const guardianContact = typeof input.guardian_contact === "string" ? input.guardian_contact.trim() : ""
  if (age < 18 && (!guardianName || !guardianContact)) {
    return "For participants under 18 we need a parent/guardian name and contact number."
  }

  return {
    category,
    is_core: isCore,
    baby_photo_url: babyPhotoUrl,
    guardian_name: guardianName || null,
    guardian_contact: guardianContact || null,
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = rateLimit(`retreat:${ip}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const eventId = typeof body.eventId === "string" ? body.eventId : ""
  const memberId = typeof body.memberId === "string" ? body.memberId : ""
  const retreatInput = (body.retreat ?? {}) as Record<string, unknown>
  const walkIn = body.walkIn === true
  const status = walkIn ? "attended" : "registered"

  if (!eventId) return NextResponse.json({ error: "Missing event." }, { status: 400 })

  const supabase = createRouteHandlerClient()

  // ---- Existing member: attendance row only -------------------------------
  if (memberId) {
    const birthdate = typeof retreatInput.birthdate === "string" ? retreatInput.birthdate : ""
    if (!birthdate) return NextResponse.json({ error: "Birthday is required." }, { status: 400 })
    const meta = validateRetreat(retreatInput, birthdate)
    if (typeof meta === "string") return NextResponse.json({ error: meta }, { status: 400 })

    const { data: member } = await supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .eq("id", memberId)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 })

    const { error } = await supabase.from("attendance").insert({
      member_id: memberId,
      event_id: eventId,
      status,
      attended_at: walkIn ? new Date().toISOString() : null,
      // What they chose on the form (roster only prefills client-side — it is
      // stale and under-reports). Attendance-row label ONLY: nothing here ever
      // writes members.is_youth_ya_core / is_admin.
      is_core: meta.is_core,
      category: meta.category,
      baby_photo_url: meta.baby_photo_url,
      guardian_name: meta.guardian_name,
      guardian_contact: meta.guardian_contact,
    })

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "You're already registered for this event." }, { status: 409 })
      }
      console.error("retreat register (existing) error:", error)
      return NextResponse.json({ error: "Failed to register. Please try again." }, { status: 500 })
    }

    // Walk-ins actually attended — push the attendance line (never throws).
    if (walkIn) await pushAttendanceToSheets(supabase, member, eventId)

    return NextResponse.json({ ok: true, memberId, firstName: member.first_name })
  }

  // ---- New person: member + attendance via the atomic RPC -----------------
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const input = (body.member ?? {}) as Record<string, unknown>

  if (!email || !isValidEmail(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 })
  if (!String(input.first_name ?? "").trim() || !String(input.last_name ?? "").trim()) {
    return NextResponse.json({ error: "First and last name are required." }, { status: 400 })
  }
  const birthdate = typeof input.birthdate === "string" ? input.birthdate : ""
  if (!birthdate) return NextResponse.json({ error: "Birthday is required." }, { status: 400 })
  if (body.privacyConsent !== true) {
    return NextResponse.json({ error: "Privacy consent is required." }, { status: 400 })
  }

  const meta = validateRetreat({ ...retreatInput, birthdate }, birthdate)
  if (typeof meta === "string") return NextResponse.json({ error: meta }, { status: 400 })

  const member: Record<string, unknown> = { email }
  for (const k of ALLOWED_MEMBER_FIELDS) {
    if (input[k] !== undefined && input[k] !== null) member[k] = input[k]
  }

  const { data, error } = await supabase.rpc("register_and_checkin", {
    p_member: member,
    p_event_id: eventId,
    p_status: status,
    p_retreat: meta,
  })

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This email is already registered. Go back and enter it to pre-register." },
        { status: 409 },
      )
    }
    console.error("retreat pre-register (new) error:", error)
    return NextResponse.json({ error: "Failed to register. Please try again." }, { status: 500 })
  }

  const created = (Array.isArray(data) ? data[0] : data) as Member

  if (meta.is_core) {
    // Backstop for the RPC-migration window: the pre-migration
    // register_and_checkin ignores p_retreat.is_core, so set the flag on the
    // attendance row it just created. Once the widened RPC is live this is a
    // no-op write (the row is already true). Attendance only — never members.
    const { error: coreError } = await supabase
      .from("attendance")
      .update({ is_core: true })
      .eq("member_id", created.id)
      .eq("event_id", eventId)
    if (coreError) console.error("retreat core label backstop error:", coreError)
  }

  if (walkIn) {
    // Walk-ins attended for real: member + attendance lines (never throws).
    await pushRegistrationToSheets(supabase, created, eventId)
  } else {
    // Pre-registration: member sync only. Deliberately NOT an attendance
    // line — the sheet's attendance tab stays true.
    try {
      await syncMemberToSheet(created)
    } catch (err) {
      console.error("Sheets sync (retreat pre-registration) failed:", err)
    }
  }

  return NextResponse.json({ ok: true, memberId: created.id, firstName: created.first_name })
}
