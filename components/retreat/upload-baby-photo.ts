import { createBrowserClient } from "@/lib/supabase"

/**
 * Upload the required YA baby photo and return its public URL.
 * Unlike the optional profile photo (best-effort), this THROWS on failure —
 * the photo is a required part of YA registration, so the form must not
 * submit without it.
 *
 * NOTE: goes to the same public-read member-photos bucket as profile photos.
 * Accepted risk for now — Batch 4 (private bucket + signed URLs) is queued.
 */
export async function uploadBabyPhoto(file: File): Promise<string> {
  const supabase = createBrowserClient()
  const ext = file.name.split(".").pop() || "jpg"
  const fileName = `baby-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage.from("member-photos").upload(fileName, file)
  if (error) {
    console.error("Baby photo upload error:", error)
    throw new Error("Photo upload failed")
  }

  const { data } = supabase.storage.from("member-photos").getPublicUrl(fileName)
  return data.publicUrl
}
