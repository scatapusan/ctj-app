import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { readSession } from "@/lib/admin-session"

interface InviteBody {
  email?: string
  pin?: string
  role?: "admin" | "core"
  firstName?: string
  lastName?: string
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function isValidPin(s: string) {
  return /^\d{4,8}$/.test(s)
}

export async function POST(request: Request) {
  // 1. Verify caller is a logged-in superadmin via signed cookie
  const session = readSession()
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only superadmins can invite members" },
      { status: 403 }
    )
  }

  // 2. Validate input
  const body = (await request.json().catch(() => ({}))) as InviteBody
  const email = body.email?.trim().toLowerCase()
  const pin = body.pin?.trim()
  const role = body.role
  const firstName = body.firstName?.trim() || ""
  const lastName = body.lastName?.trim() || ""

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }
  if (!pin || !isValidPin(pin)) {
    return NextResponse.json(
      { error: "PIN must be 4–8 digits" },
      { status: 400 }
    )
  }
  if (role !== "admin" && role !== "core") {
    return NextResponse.json({ error: "Role must be 'admin' or 'core'" }, { status: 400 })
  }

  // 3. Use service-role client to upsert the members row with PIN + role flags
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    )
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existingMember } = await admin
    .from("members")
    .select("id")
    .eq("email", email)
    .maybeSingle()

  const flagPatch =
    role === "admin"
      ? { is_admin: true, is_youth_ya_core: true }
      : { is_youth_ya_core: true }

  if (existingMember) {
    const { error: updateErr } = await admin
      .from("members")
      .update({ pin, ...flagPatch })
      .eq("id", existingMember.id)

    if (updateErr) {
      return NextResponse.json(
        { error: `Couldn't update member: ${updateErr.message}` },
        { status: 500 }
      )
    }
  } else {
    const { error: insertErr } = await admin.from("members").insert({
      email,
      first_name: firstName || email.split("@")[0],
      last_name: lastName || "",
      pin,
      ...flagPatch,
    })

    if (insertErr) {
      return NextResponse.json(
        { error: `Couldn't create member: ${insertErr.message}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    ok: true,
    email,
    role,
    message: `${role === "admin" ? "Admin" : "Core leader"} invited`,
  })
}
