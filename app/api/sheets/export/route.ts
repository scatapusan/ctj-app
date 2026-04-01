import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { exportAllToSheet } from "@/lib/google-sheets"
import { MEMBER_COLUMNS } from "@/lib/supabase"

export async function POST() {
  try {
    const supabase = createRouteHandlerClient()

    // Fetch all members
    const { data: members, error: membersErr } = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .order("last_name", { ascending: true })

    if (membersErr) {
      return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 })
    }

    // Fetch all attendance with member + event info
    const { data: attendance, error: attErr } = await supabase
      .from("attendance")
      .select("id, checked_in_at, member_id, event_id")
      .order("checked_in_at", { ascending: true })

    if (attErr) {
      return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 })
    }

    // Enrich attendance with names
    let attendanceRecords: { memberName: string; email: string; eventName: string; checkedInAt: string }[] = []

    if (attendance && attendance.length > 0) {
      const memberIds = Array.from(new Set(attendance.map((a) => a.member_id)))
      const eventIds = Array.from(new Set(attendance.map((a) => a.event_id)))

      const [membersData, eventsData] = await Promise.all([
        supabase.from("members").select("id, first_name, last_name, email").in("id", memberIds),
        supabase.from("events").select("id, name").in("id", eventIds),
      ])

      const memberMap = new Map(
        (membersData.data || []).map((m) => [m.id, { name: `${m.first_name} ${m.last_name}`, email: m.email }])
      )
      const eventMap = new Map(
        (eventsData.data || []).map((e) => [e.id, e.name])
      )

      attendanceRecords = attendance.map((a) => ({
        memberName: memberMap.get(a.member_id)?.name || "Unknown",
        email: memberMap.get(a.member_id)?.email || "",
        eventName: eventMap.get(a.event_id) || "Unknown Event",
        checkedInAt: a.checked_in_at,
      }))
    }

    const result = await exportAllToSheet(members || [], attendanceRecords)

    return NextResponse.json({
      ok: true,
      exported: result,
    })
  } catch (err) {
    console.error("Sheets export error:", err)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
