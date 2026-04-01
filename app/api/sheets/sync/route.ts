import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { syncMemberToSheet, syncAttendanceToSheet } from "@/lib/google-sheets"
import { MEMBER_COLUMNS } from "@/lib/supabase"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { type, data } = body
    const supabase = createRouteHandlerClient()

    if (type === "member") {
      const { data: member, error } = await supabase
        .from("members")
        .select(MEMBER_COLUMNS)
        .eq("id", data.memberId)
        .single()

      if (error || !member) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 })
      }

      await syncMemberToSheet(member)
      return NextResponse.json({ ok: true, synced: "member" })
    }

    if (type === "attendance") {
      // Look up member and event names from IDs
      const [memberRes, eventRes] = await Promise.all([
        supabase
          .from("members")
          .select("first_name, last_name, email")
          .eq("id", data.memberId)
          .single(),
        supabase
          .from("events")
          .select("name")
          .eq("id", data.eventId)
          .single(),
      ])

      if (memberRes.error || eventRes.error) {
        return NextResponse.json({ error: "Member or event not found" }, { status: 404 })
      }

      const memberName = `${memberRes.data.first_name} ${memberRes.data.last_name}`
      const checkedInAt = data.checkedInAt || new Date().toISOString()

      await syncAttendanceToSheet(
        memberName,
        memberRes.data.email,
        eventRes.data.name,
        checkedInAt
      )
      return NextResponse.json({ ok: true, synced: "attendance" })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (err) {
    console.error("Sheets sync error:", err)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}
