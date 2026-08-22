import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireRole } from "@/lib/admin-auth"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { PHOTO_BUCKET, babyPhotoObjectPath } from "@/lib/photos"
import { extensionForPhoto, uniqueFilename, photoZipFilename } from "@/lib/photo-filenames"
import { formatExportTimestamp } from "@/lib/retreat-export"
import { zipStream, type ZipEntry } from "@/lib/zip"

// Bulk download of one event's baby photos as a ZIP, each file named after the
// person in the photo. Admin OR core, matching the CSV export.
//
// The retreat runs a guess-the-baby activity, which needs the photos as actual
// files on someone's laptop. The storage object names ("baby-1786166356633-
// ej1nor96lw.jpeg") carry no identity at all, so the naming in
// lib/photo-filenames.ts is the feature, not a detail: every entry is
// "Juan Dela Cruz.jpg", deduplicated and safe to extract on Windows.
//
// GET ?eventId=... -> application/zip attachment
//
// Notes on the shape of this route:
//
//   * Only registrants WITH a photo are included. The photo is required for YA
//     and optional for Core, so most rows have none; that is normal, not an
//     error, and they are simply absent from the archive.
//   * The bucket is private. Downloads go through the service-role client
//     server-side, so no signed URL is ever minted for these bytes and nothing
//     downloadable leaks into a link that outlives the request.
//   * The archive is STREAMED. Buffering 44 photos would mean holding ~90MB in
//     the function and, on Vercel, exceeding the non-streaming response body
//     limit. Streaming keeps memory at a few photos and starts the download
//     immediately.
//   * Because the response has already begun by the time a photo can fail, a
//     photo whose object has gone missing is skipped rather than aborting the
//     whole archive, and the archive then carries a _read-me.txt naming exactly
//     who is not in it. A partial archive that says so beats both an archive
//     that silently omits people and a failed download.
//   * GET ?eventId=...&probe=1 runs the same checks and answers with JSON
//     { ok, count } instead of an archive, so the UI can surface a lapsed
//     session as a toast before it starts a download it cannot intercept.

export const runtime = "nodejs"
// GET route handlers are cached by default in Next 14. reading the session
// cookie already forces this route dynamic, but the archive must never be
// served from a cache, so it is stated rather than relied upon.
export const dynamic = "force-dynamic"
// Vercel's default is 300s on every plan and 300s is also Hobby's maximum, so
// this is the ceiling, not a reduction of it. Up to 44 photos at the 5MB cap
// is far inside it; the headroom is for a slow venue connection.
export const maxDuration = 300

/** How many photos to fetch ahead of the writer. Bounds memory AND wall clock. */
const DOWNLOAD_CONCURRENCY = 4

interface PhotoTarget {
  /** Display name of the person, used verbatim as the file name base. */
  personName: string
  /** Stored value: a bucket object path, or a legacy absolute URL. */
  stored: string
  /** False when the member row was missing and the name is a stand-in. */
  named: boolean
}

/**
 * Reserved for the archive's own note, so a registrant whose name sanitizes to
 * this can never collide with it. Leading underscore sorts it to the top of a
 * file listing, where someone will actually see it.
 */
const NOTE_ENTRY_NAME = "_read-me.txt"

/** Extensions Windows cannot open without a separately-installed codec. */
const AWKWARD_EXTENSIONS = new Set(["heic", "heif"])

interface LoadedPhoto {
  target: PhotoTarget
  bytes: Uint8Array | null
  contentType: string | null
  /** Why it is absent, when bytes is null. Goes into the archive's note. */
  reason?: string
}

/**
 * Fetch one photo's bytes from our own storage bucket. Never throws: a failure
 * returns bytes: null so the archive can carry on and account for the gap.
 *
 * The stored value is checked before it is used, not after. This column is
 * written from a PUBLIC form, and rows predating the write-side guard were
 * never re-validated, so it can hold something that is not one of our objects
 * at all. Two things would go wrong if it were used as-is: an absolute URL
 * would make the server fetch an address of someone else's choosing and hand
 * the reply to a leader as a file, and a path with a slash or a '..' would
 * address a different object under the service-role key. Neither is requested;
 * the archive's note says the photo was skipped.
 */
async function loadPhoto(supabase: SupabaseClient, target: PhotoTarget): Promise<LoadedPhoto> {
  const objectPath = babyPhotoObjectPath(target.stored)
  if (!objectPath) {
    console.error(`baby photo skipped, not a stored object: ${target.stored}`)
    return { target, bytes: null, contentType: null, reason: "not a stored photo" }
  }

  try {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(objectPath)
    if (error || !data) throw error ?? new Error("no data")
    return {
      target,
      bytes: new Uint8Array(await data.arrayBuffer()),
      contentType: data.type || null,
    }
  } catch (err) {
    console.error(`baby photo download failed for ${target.stored}:`, err)
    return { target, bytes: null, contentType: null, reason: "file could not be read from storage" }
  }
}

/**
 * Yield loaded photos IN ORDER while keeping a few downloads in flight, so the
 * archive still reads in check-in order but the request is not 44 sequential
 * round trips to storage.
 */
async function* loadInOrder(
  supabase: SupabaseClient,
  targets: PhotoTarget[],
): AsyncGenerator<LoadedPhoto> {
  const window: Promise<LoadedPhoto>[] = []
  let next = 0
  while (next < targets.length && window.length < DOWNLOAD_CONCURRENCY) {
    window.push(loadPhoto(supabase, targets[next++]))
  }
  while (window.length > 0) {
    const head = await window.shift()!
    if (next < targets.length) window.push(loadPhoto(supabase, targets[next++]))
    yield head
  }
}

/**
 * Build the archive's note, or null when there is nothing worth saying.
 *
 * The response status is committed the moment the first byte is written, so
 * this file is the only way the archive can tell a leader that it is not
 * exactly what they expected: who is missing, who could not be identified, and
 * which files their laptop may refuse to open.
 */
function buildNote(missing: string[], unnamed: string[], awkward: string[]): string | null {
  const sections: string[] = []

  if (missing.length > 0) {
    sections.push(
      "NOT IN THIS ARCHIVE\r\n" +
        "These registrants have a photo on their registration, but it could not " +
        "be included:\r\n" +
        missing.map((m) => `  - ${m}`).join("\r\n"),
    )
  }

  if (unnamed.length > 0) {
    sections.push(
      "COULD NOT BE NAMED\r\n" +
        "These photos are in the archive, but the member record they belong to " +
        "is gone, so they are named after the stored file instead of a person:\r\n" +
        unnamed.map((m) => `  - ${m}`).join("\r\n"),
    )
  }

  if (awkward.length > 0) {
    sections.push(
      "MAY NOT OPEN ON WINDOWS\r\n" +
        "These are iPhone HEIC photos. Windows 10 and 11 need the free HEIF " +
        "Image Extensions from the Microsoft Store to open them; macOS, iOS and " +
        "Google Photos open them as they are:\r\n" +
        awkward.map((m) => `  - ${m}`).join("\r\n"),
    )
  }

  return sections.length > 0 ? `${sections.join("\r\n\r\n")}\r\n` : null
}

/** Turn loaded photos into named archive entries, accounting for any failures. */
async function* photoEntries(
  supabase: SupabaseClient,
  targets: PhotoTarget[],
  modified: Date,
): AsyncGenerator<ZipEntry> {
  // Seeded with the note's own base name so a registrant called "_read-me"
  // cannot produce two entries that overwrite each other on extraction.
  const taken = new Set<string>([NOTE_ENTRY_NAME.replace(/\.txt$/, "").toLowerCase()])
  const missing: string[] = []
  const unnamed: string[] = []
  const awkward: string[] = []

  for await (const loaded of loadInOrder(supabase, targets)) {
    const { target } = loaded
    if (!loaded.bytes) {
      missing.push(`${target.personName} — ${loaded.reason ?? "unavailable"}`)
      continue
    }

    const ext = extensionForPhoto(target.stored, loaded.contentType)
    const name = uniqueFilename(target.personName, ext, taken)
    if (!target.named) unnamed.push(name)
    if (AWKWARD_EXTENSIONS.has(ext)) awkward.push(name)

    yield { name, data: loaded.bytes, modified }
  }

  const note = buildNote(missing, unnamed, awkward)
  if (note) yield { name: NOTE_ENTRY_NAME, data: new TextEncoder().encode(note), modified }
}

/**
 * Now, as Manila wall-clock. Entry timestamps are MS-DOS local time with no
 * zone, and the function runs in UTC, so without this every extracted file
 * would be stamped eight hours behind the ministry's own clock.
 */
function manilaNow(now: Date): Date {
  const [date, time] = formatExportTimestamp(now.toISOString()).split(" ")
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute, second] = time.split(":").map(Number)
  return new Date(year, month - 1, day, hour, minute, second)
}

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
    console.error("photo zip event error:", eventError)
    return NextResponse.json({ error: "Failed to build the download." }, { status: 500 })
  }
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 })

  const { data: attendance, error } = await supabase
    .from("attendance")
    .select("id, member_id, baby_photo_url, checked_in_at")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: true })

  if (error) {
    console.error("photo zip attendance error:", error)
    return NextResponse.json({ error: "Failed to build the download." }, { status: 500 })
  }

  // Registrants without a photo are skipped here, before anything else runs.
  const withPhotos = (attendance ?? []).filter(
    (a) => typeof a.baby_photo_url === "string" && a.baby_photo_url.length > 0,
  )

  if (withPhotos.length === 0) {
    return NextResponse.json(
      { error: "No baby photos have been uploaded for this event yet." },
      { status: 404 },
    )
  }

  const memberIds = Array.from(new Set(withPhotos.map((a) => a.member_id)))
  const { data: members, error: memberError } = await supabase
    .from("members")
    .select("id, first_name, last_name")
    .in("id", memberIds)

  if (memberError) {
    console.error("photo zip members error:", memberError)
    return NextResponse.json({ error: "Failed to build the download." }, { status: 500 })
  }

  const memberMap = new Map(
    (members ?? []).map((m) => [m.id, `${m.first_name} ${m.last_name}`.trim()]),
  )

  const targets: PhotoTarget[] = withPhotos.map((a) => {
    const stored = a.baby_photo_url as string
    const name = memberMap.get(a.member_id)
    return {
      // A registration whose member row has gone missing still has a photo
      // worth handing over; naming it after the object keeps it traceable
      // instead of producing a pile of identical "Unknown" files. The archive's
      // note calls these out, since an object name is exactly what this
      // feature exists to avoid handing anyone.
      personName: name || `Unknown - ${stored.split("/").pop()?.split(".")[0] ?? stored}`,
      stored,
      named: !!name,
    }
  })

  // The browser downloads this by navigating to the URL, which cannot show a
  // toast if the session has lapsed. The probe answers the same role and event
  // checks as a small JSON reply first, so an error is still a toast rather
  // than a page of raw JSON where a file was expected.
  if (new URL(request.url).searchParams.get("probe") === "1") {
    return NextResponse.json(
      { ok: true, count: targets.length },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  const now = new Date()
  const filename = photoZipFilename(
    event.name as string,
    formatExportTimestamp(now.toISOString()).slice(0, 10),
  )

  return new Response(zipStream(photoEntries(supabase, targets, manilaNow(now))), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Childhood photos of minors — never cached anywhere shared.
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      // Deliberately NO Content-Length: the archive is produced as it goes and
      // its size is not known until the last photo has been read. Declaring a
      // guess would truncate the download; the cost is a progress bar without
      // a total, which the browser handles as an indeterminate download.
    },
  })
}
