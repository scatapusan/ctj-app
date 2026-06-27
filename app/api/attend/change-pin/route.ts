import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { verifyPinServer } from "@/lib/pin-server"
import { rateLimit, getClientIp } from "@/lib/rate-limit"

// Change a member's PIN: verify the current PIN, then set the new one — all
// server-side. (PINs are still plaintext today; Batch 3 hashes + adds lockout.)
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const memberId = typeof body.memberId === "string" ? body.memberId : ""
  const currentPin = typeof body.currentPin === "string" ? body.currentPin : ""
  const newPin = typeof body.newPin === "string" ? body.newPin : ""

  if (!memberId || !currentPin || !newPin) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 })
  }
  if (!/^\d{4}$/.test(newPin)) {
    return NextResponse.json({ error: "New PIN must be exactly 4 digits." }, { status: 400 })
  }

  const ip = getClientIp(request)
  const rl = rateLimit(`pin:${memberId}:${ip}`, 8, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Please wait." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } })
  }

  const supabase = createRouteHandlerClient()
  const ok = await verifyPinServer(supabase, memberId, currentPin)
  if (ok === null) return NextResponse.json({ error: "Something went wrong." }, { status: 500 })
  if (!ok) return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 401 })

  const { error } = await supabase.from("members").update({ pin: newPin }).eq("id", memberId)
  if (error) {
    console.error("change-pin update error:", error)
    return NextResponse.json({ error: "Failed to update PIN." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
