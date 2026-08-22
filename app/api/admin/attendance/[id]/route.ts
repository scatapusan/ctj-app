import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { signPhoto, babyPhotoObjectPath } from "@/lib/photos"
import { ageOnDate } from "@/lib/retreat-export"
import { categoryLabel, type RetreatCategory } from "@/lib/types"

// One registrant's full retreat registration. Admin OR core.
//
// Until this route existed, the answers the retreat form collects — birthday,
// address, contact number, guardian name and number, and the baby photo — could
// only leave the database through the CSV export. They were in no screen at
// all, so checking one person's guardian contact meant downloading a
// spreadsheet of all 44 registrants.
//
// The gate matches the rest of /api/admin/attendance and the export: core
// leaders run the retreat day-of and were given the same access as admin
// deliberately by the ministry. That means every core-role login can read any
// registrant's home address and phone number, and for minors their guardian's
// number, one row at a time. Do not widen this further — there is no public
// path to this data — and keep the no-store header below.
//
// GET /api/admin/attendance/<attendance id> -> { record }
//
// The photo link is a short-lived signed URL: the bucket is private, and 10
// minutes is long enough to render the screen without leaving a working link
// behind in a browser history or a screenshot of the network tab.

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const id = params.id
  if (!id) return NextResponse.json({ error: "Missing registration id." }, { status: 400 })

  const supabase = createRouteHandlerClient()

  const { data: row, error } = await supabase
    .from("attendance")
    .select(
      "id, member_id, event_id, status, checked_in_at, attended_at, category, is_core, baby_photo_url, guardian_name, guardian_contact",
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("attendance detail error:", error)
    return NextResponse.json({ error: "Failed to load this registration." }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: "Registration not found." }, { status: 404 })

  const [{ data: member, error: memberError }, { data: event, error: eventError }] =
    await Promise.all([
      supabase
        .from("members")
        .select(
          "id, first_name, middle_name, last_name, nickname, email, birthdate, address, contact_number",
        )
        .eq("id", row.member_id)
        .maybeSingle(),
      supabase.from("events").select("id, name, event_date").eq("id", row.event_id).maybeSingle(),
    ])

  // A member row that is GONE is handled below (the registration still matters).
  // A member query that FAILED is different: returning the record anyway would
  // render a screen full of blanks that reads exactly like a deleted member.
  if (memberError || eventError) {
    console.error("attendance detail join error:", memberError ?? eventError)
    return NextResponse.json({ error: "Failed to load this registration." }, { status: 500 })
  }

  // Age answers "is this person a minor AT the retreat", so it is computed
  // against the event date — the same rule the CSV export uses. Falls back to
  // today only if the event has no readable date.
  const rawEventDate = event?.event_date ? String(event.event_date).slice(0, 10) : null
  const parsedEventDate = rawEventDate ? new Date(`${rawEventDate}T00:00:00Z`) : null
  const ageOn =
    parsedEventDate && !isNaN(parsedEventDate.getTime()) ? parsedEventDate : new Date()

  const stored = (row.baby_photo_url as string | null) ?? null
  // Only a real bucket object is signed and rendered — see babyPhotoObjectPath.
  const photoPath = babyPhotoObjectPath(stored)
  const category = (row.category as RetreatCategory | null) ?? null
  const isCore = row.is_core === true

  const record = {
    id: row.id,
    memberId: row.member_id,
    eventId: row.event_id,
    eventName: (event?.name as string | undefined) ?? null,
    eventDate: rawEventDate,

    // A member row can be missing (deleted out from under the registration).
    // The registration's own answers still matter, so the record is returned
    // either way rather than 404ing the whole screen.
    firstName: member?.first_name ?? null,
    middleName: member?.middle_name ?? null,
    lastName: member?.last_name ?? null,
    name: member ? `${member.first_name} ${member.last_name}`.trim() : "Unknown",
    nickname: member?.nickname ?? null,
    email: member?.email ?? null,
    birthdate: member?.birthdate ?? null,
    age: ageOnDate(member?.birthdate ?? null, ageOn),
    address: member?.address ?? null,
    contactNumber: member?.contact_number ?? null,

    category,
    isCore,
    categoryLabel: categoryLabel(category, isCore),
    // Default matches the list route: rows written before the retreat
    // migration have no status column and were all real check-ins.
    status: (row as { status?: string }).status ?? "attended",
    registeredAt: (row.checked_in_at as string | null) ?? null,
    attendedAt: (row.attended_at as string | null) ?? null,

    guardianName: (row.guardian_name as string | null) ?? null,
    guardianContact: (row.guardian_contact as string | null) ?? null,

    // True whenever the registration claims a photo, even if it turns out not
    // to be readable — the panel then says "unavailable" rather than "none".
    hasBabyPhoto: !!stored,
    // null when there is no photo, or when signing failed — the UI shows a
    // placeholder rather than a broken image either way.
    babyPhotoUrl: await signPhoto(supabase, photoPath),
  }

  return NextResponse.json(
    { record },
    {
      headers: {
        // Home addresses and minors' guardian contacts — keep this out of every
        // shared and browser cache, exactly like the CSV export.
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    },
  )
}
