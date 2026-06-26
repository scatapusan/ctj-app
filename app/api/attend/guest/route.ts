import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { pushRegistrationToSheets } from "@/lib/attend-sheets"
import type { Member } from "@/lib/types"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const eventId = typeof body.eventId === "string" ? body.eventId : ""
  const firstName = String(body.firstName ?? "").trim()
  const lastName = String(body.lastName ?? "").trim()
  const contactNumber = String(body.contactNumber ?? "").trim()

  if (!eventId) return NextResponse.json({ error: "Missing event." }, { status: 400 })
  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required." }, { status: 400 })
  if (body.privacyConsent !== true) return NextResponse.json({ error: "Privacy consent is required." }, { status: 400 })

  // Guests get a synthetic, non-deliverable email so they fit the members table.
  const guestEmail = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@guest.local`

  const member = {
    email: guestEmail,
    first_name: firstName,
    last_name: lastName,
    contact_number: contactNumber || null,
    is_guest: true,
  }

  const supabase = createRouteHandlerClient()
  const { data, error } = await supabase.rpc("register_and_checkin", {
    p_member: member,
    p_event_id: eventId,
  })

  if (error) {
    console.error("guest register_and_checkin error:", error)
    return NextResponse.json({ error: "Failed to check in. Please try again." }, { status: 500 })
  }

  const created = (Array.isArray(data) ? data[0] : data) as Member
  await pushRegistrationToSheets(supabase, created, eventId)

  return NextResponse.json({ ok: true, firstName })
}
