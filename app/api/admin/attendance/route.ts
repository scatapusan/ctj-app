import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"

// Attendance records for one event (enriched with member name/email). Admin or core.
export async function GET(request: Request) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const eventId = new URL(request.url).searchParams.get("eventId")
  if (!eventId) return NextResponse.json({ records: [] })

  const supabase = createRouteHandlerClient()
  const { data: attendance, error } = await supabase
    .from("attendance")
    .select("id, checked_in_at, member_id")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: true })

  if (error) {
    console.error("admin attendance error:", error)
    return NextResponse.json({ error: "Failed to load attendance." }, { status: 500 })
  }

  let records: { id: string; member_name: string; email: string; checked_in_at: string }[] = []
  const rows = attendance ?? []
  if (rows.length > 0) {
    const memberIds = Array.from(new Set(rows.map((a) => a.member_id)))
    const { data: members } = await supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .in("id", memberIds)
    const memberMap = new Map(
      (members ?? []).map((m) => [m.id, { name: `${m.first_name} ${m.last_name}`, email: m.email }]),
    )
    records = rows.map((a) => ({
      id: a.id,
      member_name: memberMap.get(a.member_id)?.name ?? "Unknown",
      email: memberMap.get(a.member_id)?.email ?? "",
      checked_in_at: a.checked_in_at,
    }))
  }

  return NextResponse.json({ records })
}
