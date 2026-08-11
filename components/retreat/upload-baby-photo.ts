/**
 * Upload a photo through the server route and return its storage PATH
 * (not a URL — the bucket is private and reads go through signed URLs).
 *
 * Throws on failure. Callers that treat the photo as required (the YA baby
 * photo) must not submit without it; callers where it is optional catch and
 * continue.
 */
export async function uploadPhoto(file: File, kind: "profile" | "baby"): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  form.append("kind", kind)

  const res = await fetch("/api/photos/upload", { method: "POST", body: form })
  const data = await res.json().catch(() => ({}))

  if (!res.ok || !data.path) {
    console.error("Photo upload failed:", data.error ?? res.status)
    throw new Error(data.error || "Photo upload failed")
  }
  return data.path as string
}

/** Back-compat alias for the retreat flow's required baby photo. */
export function uploadBabyPhoto(file: File): Promise<string> {
  return uploadPhoto(file, "baby")
}
