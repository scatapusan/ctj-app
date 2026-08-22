import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { signPhotos, babyPhotoObjectPath, PHOTO_EXPORT_TTL_SECONDS } from "@/lib/photos"
import { buildRetreatCsv, exportFilename, type RetreatExportRow } from "@/lib/retreat-export"
import type { RetreatCategory } from "@/lib/types"

// Full CSV export of one event's registrations.
//
// Admin OR core, matching the rest of /api/admin/attendance. This was
// admin-only when first built, and the ministry deliberately widened it: core
// leaders run the retreat day-of and need the same file.
//
// Be aware of what that means when changing this route. The file carries every
// registrant's home address, personal phone number, birthday and (for minors)
// their guardian's contact details, for a group that includes 12-year-olds —
// so every core-role login can download all of it. It is never cached, and a
// downloaded copy is outside the app's control entirely. Do not widen the gate
// further (there is no public path to this data) and do not add fields beyond
// what the retreat form collects without asking the ministry first.
//
// GET ?eventId=... -> text/csv attachment
//
// Built on the server rather than in the browser so the role gate is
// enforceable at all, the escaping is consistent, and the PII never has to be
// loaded into the attendance table's client-side state to be exportable.

export async function GET(request: Request) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const eventId = new URL(request.url).searchParams.get("eventId") ?? ""
  if (!eventId) return NextResponse.json({ error: "Missing event." }, { status: 400 })

  const supabase = createRouteHandlerClient()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, event_date")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    console.error("attendance export event error:", eventError)
    return NextResponse.json({ error: "Failed to build the export." }, { status: 500 })
  }
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 })

  const { data: attendance, error } = await supabase
    .from("attendance")
    .select(
      "id, member_id, status, checked_in_at, attended_at, category, is_core, baby_photo_url, guardian_name, guardian_contact",
    )
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: true })

  if (error) {
    console.error("attendance export error:", error)
    return NextResponse.json({ error: "Failed to build the export." }, { status: 500 })
  }

  const attendanceRows = attendance ?? []
  let rows: RetreatExportRow[] = []

  if (attendanceRows.length > 0) {
    const memberIds = Array.from(new Set(attendanceRows.map((a) => a.member_id)))
    const { data: members, error: memberError } = await supabase
      .from("members")
      .select("id, first_name, last_name, nickname, email, birthdate, address, contact_number")
      .in("id", memberIds)

    if (memberError) {
      console.error("attendance export members error:", memberError)
      return NextResponse.json({ error: "Failed to build the export." }, { status: 500 })
    }

    const memberMap = new Map((members ?? []).map((m) => [m.id, m]))

    // Private bucket: one batched signing round trip, with a TTL that outlives
    // the download. A photo whose object is missing signs to null and the link
    // column is simply blank — the file column still names it.
    const signed = await signPhotos(
      supabase,
      attendanceRows.map((a) => babyPhotoObjectPath(a.baby_photo_url as string | null)),
      PHOTO_EXPORT_TTL_SECONDS,
    )

    rows = attendanceRows.map((a) => {
      const m = memberMap.get(a.member_id)
      const photo = (a.baby_photo_url as string | null) ?? null
      // The File column still names whatever is stored, so a bad value is
      // visible; only the LINK column is withheld for a non-object value.
      const photoPath = babyPhotoObjectPath(photo)
      return {
        firstName: m?.first_name ?? "Unknown",
        lastName: m?.last_name ?? "",
        nickname: m?.nickname ?? null,
        email: m?.email ?? "",
        category: (a.category as RetreatCategory | null) ?? null,
        isCore: a.is_core === true,
        // Default matches the attendance route: rows read before the retreat
        // migration landed have no status column and were all real check-ins.
        status: (a as { status?: string }).status ?? "attended",
        birthdate: m?.birthdate ?? null,
        address: m?.address ?? null,
        contactNumber: m?.contact_number ?? null,
        guardianName: (a.guardian_name as string | null) ?? null,
        guardianContact: (a.guardian_contact as string | null) ?? null,
        babyPhotoFile: photo,
        babyPhotoLink: photoPath ? (signed.get(photoPath) ?? null) : null,
        registeredAt: a.checked_in_at as string | null,
        attendedAt: (a.attended_at as string | null) ?? null,
      }
    })
  }

  // Ages are computed against the EVENT date: "is this person a minor at the
  // retreat" is the question the number has to answer.
  const eventDate = new Date(`${String(event.event_date).slice(0, 10)}T00:00:00Z`)
  const ageOn = isNaN(eventDate.getTime()) ? new Date() : eventDate

  // Leading BOM so Excel reads it as UTF-8 — Filipino names and addresses carry
  // accented characters that would otherwise arrive mojibaked. Written as an
  // escape because the literal character is invisible in an editor.
  const csv = `\uFEFF${buildRetreatCsv(rows, ageOn)}`
  const filename = exportFilename(event.name as string, new Date())

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Contains PII — keep it out of every shared and browser cache.
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  })
}
