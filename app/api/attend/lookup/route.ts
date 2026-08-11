import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { signPhoto } from "@/lib/photos"

// Public member lookup by email. Returns ONLY minimal identity fields (never the
// full PII record — that requires the PIN, see /api/attend/profile) and is
// IP-throttled so it can't be hammered to harvest who is registered.
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = rateLimit(`lookup:${ip}`, 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many lookups. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const eventId = typeof body.eventId === "string" ? body.eventId : ""

  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 })

  const supabase = createRouteHandlerClient()
  const { data: member, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, photo_url, is_guest")
    .eq("email", email)
    .maybeSingle()

  if (error) {
    console.error("lookup error:", error)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
  if (!member) return NextResponse.json({ found: false })

  let alreadyCheckedIn = false
  if (eventId) {
    const { data: attendance } = await supabase
      .from("attendance")
      .select("id")
      .eq("member_id", member.id)
      .eq("event_id", eventId)
      .maybeSingle()
    alreadyCheckedIn = !!attendance
  }

  return NextResponse.json({
    found: true,
    member: {
      id: member.id,
      first_name: member.first_name,
      last_name: member.last_name,
      // Display-ready and short-lived; the bucket itself is private.
      photo_url: await signPhoto(supabase, member.photo_url),
      is_guest: member.is_guest,
    },
    alreadyCheckedIn,
  })
}
