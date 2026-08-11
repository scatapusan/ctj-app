import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import {
  PHOTO_BUCKET,
  MAX_PHOTO_BYTES,
  ALLOWED_PHOTO_TYPES,
  generatePhotoPath,
} from "@/lib/photos"

// Public photo upload. The browser no longer writes to storage directly — the
// bucket is private and the anon key (which ships in the client bundle) has no
// access to it. This route holds the only write path, using the service role.
//
// Accepts multipart/form-data: file=<File>, kind=profile|baby
// Returns { path } — a bucket-relative object path to store on the row. The
// caller never receives a URL; reads go through short-lived signed URLs issued
// to signed-in staff (or to the member themselves via /api/attend/lookup).
//
// Guards: IP rate limit, MIME allow-list, size cap, server-generated filename.

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = rateLimit(`photo-upload:${ip}`, 12, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 })
  }

  const file = form.get("file")
  const kind = form.get("kind") === "baby" ? "baby" : "profile"

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file received." }, { status: 400 })
  }

  const contentType = (file.type || "").toLowerCase()
  if (!ALLOWED_PHOTO_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Please upload a photo (JPG, PNG, or WEBP)." }, { status: 400 })
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "That file looks empty." }, { status: 400 })
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo must be under 5MB." }, { status: 413 })
  }

  const path = generatePhotoPath(kind, contentType)
  const supabase = createRouteHandlerClient()

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType, upsert: false })

  if (error) {
    console.error("photo upload error:", error.message)
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ ok: true, path })
}
