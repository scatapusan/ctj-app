import { NextResponse } from "next/server"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { MEMBER_COLUMNS } from "@/lib/supabase"
import { signPhotos } from "@/lib/photos"

// Member roster (excludes the pin column via MEMBER_COLUMNS). Admin or core.
export async function GET() {
  const guard = requireRole("admin", "core")
  if (!guard.ok) return guard.response

  const supabase = createRouteHandlerClient()
  const { data, error } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("admin members list error:", error)
    return NextResponse.json({ error: "Failed to load members." }, { status: 500 })
  }

  // One batched signing round trip for the whole roster.
  const rows = data ?? []
  const signed = await signPhotos(supabase, rows.map((m) => m.photo_url))
  const members = rows.map((m) => ({
    ...m,
    photo_path: m.photo_url,
    photo_url: m.photo_url ? (signed.get(m.photo_url) ?? null) : null,
  }))

  return NextResponse.json({ members })
}
