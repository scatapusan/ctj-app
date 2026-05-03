import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import {
  encodeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  type AdminRole,
} from "@/lib/admin-session"

interface LoginBody {
  email?: string
  pin?: string
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function isValidPin(s: string): boolean {
  return /^\d{4,8}$/.test(s)
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginBody
  const email = body.email?.trim().toLowerCase()
  const pin = body.pin?.trim()

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email or PIN." }, { status: 400 })
  }
  if (!pin || !isValidPin(pin)) {
    return NextResponse.json({ error: "Invalid email or PIN." }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { error: "Server is not configured for sign-in." },
      { status: 500 }
    )
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Look up member by email + check role
  const { data: member, error: lookupErr } = await admin
    .from("members")
    .select("id, email, is_admin, is_youth_ya_core")
    .eq("email", email)
    .maybeSingle()

  if (lookupErr || !member) {
    // Generic error so we don't leak which emails are registered
    return NextResponse.json({ error: "Invalid email or PIN." }, { status: 401 })
  }

  if (!member.is_admin && !member.is_youth_ya_core) {
    return NextResponse.json(
      { error: "You don't have admin or core leader access." },
      { status: 403 }
    )
  }

  // 2. Verify the PIN via the existing RPC
  const { data: pinValid, error: rpcErr } = await admin.rpc("verify_pin", {
    p_member_id: member.id,
    p_pin: pin,
  })

  if (rpcErr) {
    console.error("verify_pin RPC error:", rpcErr)
    return NextResponse.json({ error: "Sign-in temporarily unavailable." }, { status: 500 })
  }

  if (pinValid !== true) {
    return NextResponse.json({ error: "Invalid email or PIN." }, { status: 401 })
  }

  // 3. Issue signed session cookie
  const role: AdminRole = member.is_admin ? "admin" : "core"
  const token = encodeSession({
    memberId: member.id,
    email: member.email,
    role,
    iat: Math.floor(Date.now() / 1000),
  })

  cookies().set(SESSION_COOKIE, token, sessionCookieOptions())

  return NextResponse.json({ ok: true, role })
}
