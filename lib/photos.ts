import type { SupabaseClient } from "@supabase/supabase-js"

export const PHOTO_BUCKET = "member-photos"

/** Signed URLs are short-lived: long enough to render a page, short enough
 *  that a leaked link is useless soon after. */
export const PHOTO_URL_TTL_SECONDS = 600 // 10 minutes

/**
 * Longer TTL for links written into a downloaded CSV. A 10-minute link is dead
 * before the file finishes downloading, so exports get a week — long enough to
 * be useful for retreat prep, short enough that a mislaid spreadsheet stops
 * granting photo access soon after. Anyone who needs a link after it lapses
 * re-exports; the "Baby Photo File" column never expires.
 */
export const PHOTO_EXPORT_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

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

/**
 * Shape of an object path this app itself created: a flat, bucket-relative name
 * like 'baby-1786166356633-ej1nor96lw.jpeg'. generatePhotoPath() below is the
 * only thing that mints these, and it never produces a folder, so a slash, a
 * scheme or a '..' is by definition not one of ours.
 */
const UPLOADED_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/

/** Whether a value is a flat, bucket-relative object name this app minted. */
function isUploadedPath(value: string): boolean {
  return !value.includes("..") && UPLOADED_PATH.test(value)
}

/**
 * The stored path for a photo a PUBLIC caller claims to have uploaded, or null.
 *
 * toStoredPhotoValue() above deliberately passes an unrecognised URL straight
 * through, because members.photo_url legitimately holds third-party URLs
 * imported from Bubble. Nothing legitimate does that for a retreat baby photo:
 * /api/photos/upload is the only writer and it returns a bucket path. So on the
 * public retreat form the value is pinned to that shape.
 *
 * Without this, a registrant could POST any string — including
 * 'http://169.254.169.254/…' or a tracking pixel — and the app would later
 * render it as an <img src> on an admin screen and, worse, fetch it
 * server-side while building the photo archive.
 */
export function toUploadedPhotoPath(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null
  // Collapse one of our own storage URLs (signed or public) back to its path
  // first, so a client that echoes a read endpoint's value back still works.
  const collapsed = toStoredPhotoValue(value)
  if (!collapsed) return null
  return isUploadedPath(collapsed) ? collapsed : null
}

/**
 * The bucket object to read for a RETREAT BABY PHOTO, or null.
 *
 * Unlike members.photo_url — which legitimately holds third-party URLs from the
 * Bubble import — attendance.baby_photo_url is only ever written from
 * /api/photos/upload, and the private-bucket migration rewrote the handful that
 * predated it. So a value here that still looks like a URL is not one of our
 * photos, and it arrived from a public form. It is never signed, rendered or
 * fetched: the screens show "photo unavailable" and the archive says so in its
 * note, rather than pointing an admin's browser at an address a registrant
 * chose.
 */
export function babyPhotoObjectPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value === "") return null
  // The SAME shape check the write side applies, deliberately repeated on read:
  // rows written before that guard existed have never been re-validated, and
  // this value is passed straight to storage.download() with the service-role
  // key, where a slash or a '..' would address a different object entirely.
  return isUploadedPath(value) ? value : null
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
