import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"

// Dashboard stats + recent check-ins. Viewable by admin or core.
export async function GET() {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const supabase = createRouteHandlerClient()

  const [membersRes, eventsRes, adminsRes, recentRes] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("is_admin", true),
    supabase
      .from("attendance")
      .select("id, checked_in_at, member_id, event_id")
      .order("checked_in_at", { ascending: false })
      .limit(10),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .gte("checked_in_at", today.toISOString())

  let recent: { id: string; checked_in_at: string; member_name: string; event_name: string }[] = []
  const recentData = recentRes.data ?? []
  if (recentData.length > 0) {
    const memberIds = Array.from(new Set(recentData.map((a) => a.member_id)))
    const eventIds = Array.from(new Set(recentData.map((a) => a.event_id)))
    const [membersData, eventsData] = await Promise.all([
      supabase.from("members").select("id, first_name, last_name").in("id", memberIds),
      supabase.from("events").select("id, name").in("id", eventIds),
    ])
    const memberMap = new Map((membersData.data ?? []).map((m) => [m.id, `${m.first_name} ${m.last_name}`]))
    const eventMap = new Map((eventsData.data ?? []).map((e) => [e.id, e.name]))
    recent = recentData.map((a) => ({
      id: a.id,
      checked_in_at: a.checked_in_at,
      member_name: memberMap.get(a.member_id) ?? "Unknown",
      event_name: eventMap.get(a.event_id) ?? "Unknown Event",
    }))
  }

  return NextResponse.json({
    stats: {
      totalMembers: membersRes.count ?? 0,
      activeEvents: eventsRes.count ?? 0,
      todayAttendance: todayCount ?? 0,
      totalAdmins: adminsRes.count ?? 0,
    },
    recent,
  })
}
