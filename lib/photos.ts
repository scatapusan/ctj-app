import type { SupabaseClient } from "@supabase/supabase-js"

export const PHOTO_BUCKET = "member-photos"

/** Signed URLs are short-lived: long enough to render a page, short enough
 *  that a leaked link is useless soon after. */
export const PHOTO_URL_TTL_SECONDS = 600 // 10 minutes

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]

/**
 * Stored photo values are bucket-relative object paths after the Batch 4
 * migration, but rows written before it still hold absolute public URLs.
 * Anything that already looks like a URL is passed through untouched so the
 * app renders correctly either side of the migration.
 */
export function isLegacyAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/**
 * Mint a short-lived signed URL for one stored photo value.
 * Returns null when there is no photo or the object is missing/unreadable —
 * callers fall back to initials rather than showing a broken image.
 */
export async function signPhoto(
  supabase: SupabaseClient,
  value: string | null | undefined,
  ttlSeconds: number = PHOTO_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!value) return null
  if (isLegacyAbsoluteUrl(value)) return value

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(value, ttlSeconds)

  if (error) {
    console.error("signPhoto error:", error.message)
    return null
  }
  return data?.signedUrl ?? null
}

/**
 * Batch version — one round trip for a list of photos (member rosters).
 * Falls back to per-item signing for legacy absolute URLs, which cannot be
 * batched because they are not bucket paths.
 */
export async function signPhotos(
  supabase: SupabaseClient,
  values: (string | null | undefined)[],
  ttlSeconds: number = PHOTO_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const paths: string[] = []

  for (const v of values) {
    if (!v) continue
    if (isLegacyAbsoluteUrl(v)) out.set(v, v)
    else if (!paths.includes(v)) paths.push(v)
  }

  if (paths.length === 0) return out

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, ttlSeconds)

  if (error) {
    console.error("signPhotos error:", error.message)
    return out
  }

  for (const item of data ?? []) {
    // `path` echoes back the requested path; skip entries that failed.
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl)
  }
  return out
}

/**
 * What should be PERSISTED for a photo value.
 *
 * Read endpoints hand out signed URLs, so a client that echoes a value back on
 * save would otherwise store an expiring URL in the database. This collapses
 * any of our own storage URLs (signed or legacy public) back to the bare object
 * path, and leaves anything else — including third-party URLs imported from
 * Bubble — untouched.
 */
export function toStoredPhotoValue(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/member-photos\/([^?]+)/,
  )
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }
  return value
}

/** Server-side filename generation — never trust a client-supplied name. */
export function generatePhotoPath(kind: "profile" | "baby", contentType: string): string {
  const ext =
    contentType === "image/png" ? "png"
    : contentType === "image/webp" ? "webp"
    : contentType === "image/heic" || contentType === "image/heif" ? "heic"
    : "jpg"
  const prefix = kind === "baby" ? "baby" : "photo"
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
}
