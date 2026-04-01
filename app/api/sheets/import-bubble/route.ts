import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { exportAllToSheet } from "@/lib/google-sheets"
import { MEMBER_COLUMNS } from "@/lib/supabase"

interface BubbleUser {
  photo: string
  lastName: string
  firstName: string
  middleName: string
  birthday: string
  address: string
  mobile: string
  facebook: string
  discipler: string
  disciples: string
  lifelineLeader: string
  lifelineMembers: string
  ministry: string
  prospectDisciples: string
  reach: boolean
  freshStart: boolean
  freedomDay: boolean
  grandDay: boolean
  isCore: boolean
  email: string
  createdAt: string
}

interface BubbleAttendance {
  email: string
  event: string
  createdAt: string
}

function parseBubbleDate(dateStr: string): string | null {
  if (!dateStr) return null
  // Format: "Oct 25, 1990 12:00 am" or "Feb 12, 2023 12:45 am"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split("T")[0] // YYYY-MM-DD
}

function parseBubbleBool(val: string): boolean {
  return val.toLowerCase().trim() === "yes"
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ""
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        row.push(current)
        current = ""
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(current)
        current = ""
        rows.push(row)
        row = []
        if (ch === "\r") i++
      } else {
        current += ch
      }
    }
  }
  // Last field/row
  if (current || row.length > 0) {
    row.push(current)
    rows.push(row)
  }

  return rows
}

function parseUsers(csvText: string): BubbleUser[] {
  const rows = parseCSV(csvText)
  // Skip header row
  return rows.slice(1)
    .filter((r) => r.length >= 25 && r[24]?.trim()) // must have email (col index 24)
    .map((r) => ({
      photo: r[0] || "",
      lastName: r[1]?.trim() || "",
      firstName: r[2]?.trim() || "",
      middleName: r[3]?.trim() || "",
      birthday: r[5] || "",
      address: r[6]?.trim() || "",
      mobile: r[7]?.trim() || "",
      facebook: r[8]?.trim() || "",
      discipler: r[9]?.trim() || "",
      disciples: r[10]?.trim() || "",
      lifelineLeader: r[11]?.trim() || "",
      lifelineMembers: r[12]?.trim() || "",
      ministry: r[13]?.trim() || "",
      prospectDisciples: r[14]?.trim() || "",
      reach: parseBubbleBool(r[15] || ""),
      freshStart: parseBubbleBool(r[16] || ""),
      freedomDay: parseBubbleBool(r[17] || ""),
      grandDay: parseBubbleBool(r[18] || ""),
      isCore: parseBubbleBool(r[19] || ""),
      email: r[24]?.trim() || "",
      createdAt: r[21] || "",
    }))
    .filter((u) => u.email && u.firstName) // Skip empty/test rows
}

function parseAttendances(csvText: string): BubbleAttendance[] {
  const rows = parseCSV(csvText)
  return rows.slice(1)
    .filter((r) => r.length >= 3 && r[0]?.trim())
    .map((r) => ({
      email: r[0]?.trim().replace(/^"|"$/g, ""),
      // Fix: Bubble had wrong date "Feb 19, 2023" — actual event was Feb 22, 2026
      event: (r[1]?.trim().replace(/^"|"$/g, "") || "").replace(
        "Youth and YA Fellowship - Feb 19, 2023",
        "Youth and YA Fellowship - Feb 22, 2026"
      ),
      createdAt: r[2]?.trim().replace(/^"|"$/g, ""),
    }))
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const usersFile = formData.get("users") as File | null
    const attendanceFile = formData.get("attendance") as File | null

    if (!usersFile) {
      return NextResponse.json({ error: "Users CSV is required" }, { status: 400 })
    }

    const usersText = await usersFile.text()
    const bubbleUsers = parseUsers(usersText)

    const supabase = createRouteHandlerClient()
    let importedMembers = 0
    let skippedMembers = 0

    // Import members — upsert by email
    for (const bu of bubbleUsers) {
      // Check if member already exists
      const { data: existing } = await supabase
        .from("members")
        .select("id")
        .eq("email", bu.email)
        .maybeSingle()

      if (existing) {
        skippedMembers++
        continue
      }

      const { error: insertErr } = await supabase.from("members").insert({
        email: bu.email,
        first_name: bu.firstName,
        last_name: bu.lastName,
        middle_name: bu.middleName || null,
        birthdate: parseBubbleDate(bu.birthday),
        address: bu.address || null,
        contact_number: bu.mobile || null,
        facebook_link: bu.facebook || null,
        discipler_name: bu.discipler || null,
        disciples: bu.disciples || null,
        prospect_disciples: bu.prospectDisciples || null,
        lifeline_leader: bu.lifelineLeader || null,
        lifeline_members: bu.lifelineMembers || null,
        ministry_involvements: bu.ministry || null,
        is_youth_ya_core: bu.isCore,
        completed_reach: bu.reach,
        completed_fresh_start: bu.freshStart,
        completed_freedom_day: bu.freedomDay,
        completed_grand_day: bu.grandDay,
        photo_url: bu.photo ? `https:${bu.photo}` : null,
      })

      if (insertErr) {
        console.error(`Failed to import ${bu.email}:`, insertErr)
      } else {
        importedMembers++
      }
    }

    // Import attendance records
    let importedAttendance = 0
    let skippedAttendance = 0

    if (attendanceFile) {
      const attText = await attendanceFile.text()
      const bubbleAttendances = parseAttendances(attText)

      // Deduplicate: group by email+event, keep first occurrence
      const seen = new Set<string>()
      const uniqueAttendances = bubbleAttendances.filter((a) => {
        const key = `${a.email}|${a.event}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Get or create events from attendance data
      const eventNames = Array.from(new Set(uniqueAttendances.map((a) => a.event)))

      for (const eventName of eventNames) {
        // Check if event exists
        const { data: existingEvent } = await supabase
          .from("events")
          .select("id")
          .eq("name", eventName)
          .maybeSingle()

        if (!existingEvent) {
          // Create the event — extract date from event name if possible
          const dateMatch = eventName.match(/(\w+ \d+, \d{4})/)
          const eventDate = dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
          await supabase.from("events").insert({
            name: eventName,
            event_date: eventDate,
            is_active: false, // Historical events
          })
        }
      }

      // Now insert attendance records
      for (const att of uniqueAttendances) {
        const { data: memberData } = await supabase
          .from("members")
          .select("id")
          .eq("email", att.email)
          .maybeSingle()

        const { data: eventData } = await supabase
          .from("events")
          .select("id")
          .eq("name", att.event)
          .maybeSingle()

        if (!memberData || !eventData) {
          skippedAttendance++
          continue
        }

        const { error: attErr } = await supabase.from("attendance").insert({
          member_id: memberData.id,
          event_id: eventData.id,
        })

        if (attErr) {
          if (attErr.code === "23505") {
            skippedAttendance++ // duplicate
          } else {
            console.error(`Failed attendance for ${att.email}:`, attErr)
          }
        } else {
          importedAttendance++
        }
      }
    }

    // Now do a full export to Google Sheets
    const { data: allMembers } = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .order("last_name", { ascending: true })

    const { data: allAttendance } = await supabase
      .from("attendance")
      .select("id, checked_in_at, member_id, event_id")
      .order("checked_in_at", { ascending: true })

    let sheetsResult = null
    if (allMembers && allAttendance) {
      const memberIds = Array.from(new Set(allAttendance.map((a) => a.member_id)))
      const eventIds = Array.from(new Set(allAttendance.map((a) => a.event_id)))

      const [membersData, eventsData] = await Promise.all([
        supabase.from("members").select("id, first_name, last_name, email").in("id", memberIds.length ? memberIds : [""]),
        supabase.from("events").select("id, name").in("id", eventIds.length ? eventIds : [""]),
      ])

      const memberMap = new Map(
        (membersData.data || []).map((m) => [m.id, { name: `${m.first_name} ${m.last_name}`, email: m.email }])
      )
      const eventMap = new Map(
        (eventsData.data || []).map((e) => [e.id, e.name])
      )

      const attendanceRecords = allAttendance.map((a) => ({
        memberName: memberMap.get(a.member_id)?.name || "Unknown",
        email: memberMap.get(a.member_id)?.email || "",
        eventName: eventMap.get(a.event_id) || "Unknown Event",
        checkedInAt: a.checked_in_at,
      }))

      try {
        sheetsResult = await exportAllToSheet(allMembers, attendanceRecords)
      } catch (err) {
        console.error("Sheets export after import failed:", err)
      }
    }

    return NextResponse.json({
      ok: true,
      import: {
        members: { imported: importedMembers, skipped: skippedMembers },
        attendance: { imported: importedAttendance, skipped: skippedAttendance },
      },
      sheetsExport: sheetsResult,
    })
  } catch (err) {
    console.error("Bubble import error:", err)
    return NextResponse.json({ error: "Import failed" }, { status: 500 })
  }
}
