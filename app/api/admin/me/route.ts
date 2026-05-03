import { NextResponse } from "next/server"
import { readSession } from "@/lib/admin-session"

export async function GET() {
  const session = readSession()
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }
  return NextResponse.json({
    authenticated: true,
    memberId: session.memberId,
    email: session.email,
    role: session.role,
  })
}
