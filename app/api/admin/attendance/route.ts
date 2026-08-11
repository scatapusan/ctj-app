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
    .select("id, checked_in_at, member_id, status, attended_at, category, is_core")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: true })

  if (error) {
    console.error("admin attendance error:", error)
    return NextResponse.json({ error: "Failed to load attendance." }, { status: 500 })
  }

  let records: {
    id: string
    member_name: string
    email: string
    checked_in_at: string
    status: string
    attended_at: string | null
    category: string | null
    is_core: boolean
  }[] = []
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
      // Defaults cover rows read before the matching migration is applied.
      status: (a as { status?: string }).status ?? "attended",
      attended_at: (a as { attended_at?: string | null }).attended_at ?? null,
      category: (a as { category?: string | null }).category ?? null,
      is_core: (a as { is_core?: boolean }).is_core === true,
    }))
  }

  return NextResponse.json({ records })
}
