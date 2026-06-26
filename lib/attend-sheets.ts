import { syncMemberToSheet, syncAttendanceToSheet } from "@/lib/google-sheets"
import type { Member } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"

async function eventName(supabase: SupabaseClient, eventId: string): Promise<string> {
  try {
    const { data } = await supabase.from("events").select("name").eq("id", eventId).maybeSingle()
    return data?.name ?? "Unknown Event"
  } catch {
    return "Unknown Event"
  }
}

/**
 * Best-effort, server-side Sheets sync for a brand-new member + their first
 * check-in. Never throws — a Sheets outage must not fail registration.
 */
export async function pushRegistrationToSheets(supabase: SupabaseClient, member: Member, eventId: string): Promise<void> {
  try {
    const name = await eventName(supabase, eventId)
    await syncMemberToSheet(member)
    await syncAttendanceToSheet(`${member.first_name} ${member.last_name}`, member.email, name, new Date().toISOString())
  } catch (err) {
    console.error("Sheets sync (registration) failed:", err)
  }
}

/**
 * Best-effort, server-side attendance-only sync for an existing member's
 * check-in (their member row already exists in the sheet). Never throws.
 */
export async function pushAttendanceToSheets(
  supabase: SupabaseClient,
  member: { first_name: string; last_name: string; email: string },
  eventId: string,
): Promise<void> {
  try {
    const name = await eventName(supabase, eventId)
    await syncAttendanceToSheet(`${member.first_name} ${member.last_name}`, member.email, name, new Date().toISOString())
  } catch (err) {
    console.error("Sheets sync (check-in) failed:", err)
  }
}
