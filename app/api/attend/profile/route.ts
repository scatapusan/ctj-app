import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { MEMBER_COLUMNS } from "@/lib/supabase"
import { verifyPinServer } from "@/lib/pin-server"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { syncMemberToSheet } from "@/lib/google-sheets"
import { signPhoto, toStoredPhotoValue } from "@/lib/photos"
import type { Member } from "@/lib/types"

/** Attach a display-ready photo URL while preserving the stored path for saves. */
async function withPhoto(supabase: ReturnType<typeof createRouteHandlerClient>, member: Record<string, unknown>) {
  const stored = (member.photo_url as string | null) ?? null
  return { ...member, photo_path: stored, photo_url: await signPhoto(supabase, stored) }
}

// Fields a member may edit about themselves. Excludes email, pin, is_guest, and
// the privilege flags (is_admin, is_youth_ya_core) so a profile edit can never
// escalate access.
const EDITABLE_FIELDS = [
  "first_name", "middle_name", "last_name", "nickname", "gender", "birthdate",
  "contact_number", "facebook_link", "address", "occupation", "father_name", "mother_name",
  "emergency_contact_name", "emergency_contact_number", "discipler_name", "disciples",
  "prospect_disciples", "lifeline_leader", "lifeline_co_leaders", "lifeline_members",
  "ministry_involvements", "completed_reach", "completed_fresh_start", "completed_freedom_day",
  "completed_grand_day", "baptized_in_water", "photo_url",
] as const

function pinGate(request: Request, memberId: string) {
  const ip = getClientIp(request)
  return rateLimit(`pin:${memberId}:${ip}`, 8, 60_000)
}

// Fetch the full profile — gated behind the member's PIN.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const memberId = typeof body.memberId === "string" ? body.memberId : ""
  const pin = typeof body.pin === "string" ? body.pin : ""
  if (!memberId || !pin) return NextResponse.json({ error: "Missing PIN." }, { status: 400 })

  const rl = pinGate(request, memberId)
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Please wait." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } })

  const supabase = createRouteHandlerClient()
  const ok = await verifyPinServer(supabase, memberId, pin)
  if (ok === null) return NextResponse.json({ error: "Something went wrong." }, { status: 500 })
  if (!ok) return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 })

  const { data: member, error } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("id", memberId)
    .maybeSingle()

  if (error || !member) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 })
  }
  return NextResponse.json({ ok: true, member: await withPhoto(supabase, member) })
}

// Save profile edits — gated behind the member's PIN.
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const memberId = typeof body.memberId === "string" ? body.memberId : ""
  const pin = typeof body.pin === "string" ? body.pin : ""
  const input = (body.member ?? {}) as Record<string, unknown>
  if (!memberId || !pin) return NextResponse.json({ error: "Missing PIN." }, { status: 400 })

  const rl = pinGate(request, memberId)
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Please wait." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } })

  const supabase = createRouteHandlerClient()
  const ok = await verifyPinServer(supabase, memberId, pin)
  if (ok === null) return NextResponse.json({ error: "Something went wrong." }, { status: 500 })
  if (!ok) return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE_FIELDS) {
    if (input[k] !== undefined) update[k] = input[k]
  }
  // Never persist a signed URL, whatever the client echoed back.
  if ("photo_url" in update) {
    update.photo_url = toStoredPhotoValue(update.photo_url as string | null)
  }

  const { data: updated, error } = await supabase
    .from("members")
    .update(update)
    .eq("id", memberId)
    .select(MEMBER_COLUMNS)
    .single()

  if (error) {
    console.error("profile update error:", error)
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 })
  }

  // Best-effort server-side Sheets sync of the updated member.
  try {
    await syncMemberToSheet(updated as Member)
  } catch (err) {
    console.error("Sheets sync (profile update) failed:", err)
  }

  return NextResponse.json({ ok: true, member: await withPhoto(supabase, updated) })
}
