/**
 * Naming the baby photos after the people in them.
 *
 * The whole point of the bulk download is that a leader running the guess-the-
 * baby activity can tell who is who, so an entry is named "Juan Dela Cruz.jpg"
 * rather than "baby-1786166356633-ej1nor96lw.jpeg". Everything here exists to
 * make that survive contact with a real filesystem: two registrants share a
 * name, someone typed a slash into their surname, an extractor drops the file
 * onto a Windows desktop.
 *
 * Nothing in here touches the database or storage — pure string handling, so
 * every rule below is unit-testable on its own.
 */

/**
 * Characters Windows forbids outright in a file name, plus the control range.
 * '/' would create a directory (or fail); ':' silently truncates on some tools;
 * the rest are simply rejected by the Win32 API.
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f\x7f]/g

/**
 * MS-DOS device names. Windows still refuses to create a file called CON or
 * LPT1 — with or without an extension — so a registrant named "Aux" (or a
 * mangled record that reduces to one of these) gets a trailing underscore.
 */
const RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
])

/**
 * Kept well under the 255-byte filesystem limit. Windows also caps the whole
 * path at 260 characters by default, and these files land in a folder inside
 * someone's Downloads, so the name gets a modest budget rather than the maximum.
 */
const MAX_BASE_LENGTH = 80

/** Used when a name sanitizes down to nothing at all. */
export const FALLBACK_BASE = "Unnamed"

/** Extensions we pass through from a stored object path, lower-cased. */
const KNOWN_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp", "avif"])

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/avif": "avif",
}

/**
 * Turn a person's name into a file name base that is safe everywhere.
 *
 * Accents are KEPT: "José Peñaflor" is that person's name, the archive declares
 * its entry names as UTF-8, and every current filesystem stores them fine.
 * Transliterating would make the files less useful for the exact reader they
 * are for.
 */
export function sanitizeFilenameBase(name: string | null | undefined): string {
  let out = (name ?? "")
    // "José" can arrive as NFC (é) or NFD (e + combining accent). They look
    // identical, and macOS treats them as the same file name, so two
    // registrants spelled differently would overwrite each other on extraction.
    .normalize("NFC")
    .replace(ILLEGAL_CHARS, " ")
    // Any whitespace (including the newlines a pasted form field can carry)
    // collapses to single spaces.
    .replace(/\s+/g, " ")
    .trim()

  if (out.length > MAX_BASE_LENGTH) {
    out = out.slice(0, MAX_BASE_LENGTH)
    // slice() cuts at UTF-16 code units, so a name long enough to be trimmed
    // can be split through the middle of an emoji (people do type them into
    // name fields). The leftover half encodes as U+FFFD, putting a literal
    // replacement character in someone's file name.
    if (/[\uD800-\uDBFF]$/.test(out)) out = out.slice(0, -1)
    out = out.trim()
  }

  // Windows silently strips trailing dots and spaces, which would turn
  // "Jun." into "Jun" on extraction and break a name we deduplicated on.
  out = out.replace(/[. ]+$/, "")
  // A leading dot would make the file hidden on macOS and Linux.
  out = out.replace(/^\.+/, "").trim()

  if (!out) return FALLBACK_BASE
  // Windows refuses "CON" AND "Con.Jr" — the rule applies to everything before
  // the first dot, not to the whole name.
  if (RESERVED_NAMES.has(out.split(".")[0].toLowerCase())) return `_${out}`
  return out
}

/**
 * The file extension for a stored photo, WITHOUT the dot.
 *
 * The stored object path is trusted first: its extension was derived from the
 * upload's content type by generatePhotoPath(), so it already describes the
 * real bytes. Legacy rows hold absolute URLs (possibly with a query string),
 * and Bubble-imported ones may have no usable extension at all — those fall
 * back to the content type reported by storage, then to 'jpg'.
 */
export function extensionForPhoto(
  objectPath: string | null | undefined,
  contentType?: string | null,
): string {
  const bare = (objectPath ?? "").split("?")[0].split("#")[0]
  const lastSegment = bare.split("/").pop() ?? ""
  const dot = lastSegment.lastIndexOf(".")
  if (dot > 0) {
    const ext = lastSegment.slice(dot + 1).toLowerCase()
    if (KNOWN_EXTENSIONS.has(ext)) return ext
  }

  const type = (contentType ?? "").toLowerCase().split(";")[0].trim()
  // hasOwnProperty, not a bare lookup: 'constructor' and friends would
  // otherwise resolve to a function off Object.prototype and be returned as
  // this file's extension.
  if (Object.prototype.hasOwnProperty.call(CONTENT_TYPE_EXTENSIONS, type)) {
    return CONTENT_TYPE_EXTENSIONS[type]
  }

  return "jpg"
}

/**
 * A file name unique within one archive, numbering repeats "(2)", "(3)", …
 *
 * `taken` accumulates the base names already used and is MUTATED, so callers
 * just loop over registrants in order.
 *
 * Two things are deliberate here:
 *
 * - Comparison is case-insensitive. Windows and macOS treat "Juan Dela Cruz.jpg"
 *   and "juan dela cruz.jpg" as the same file, so extracting an archive that
 *   contained both would overwrite one of them silently.
 * - The extension is EXCLUDED from the comparison. Two different Juan Dela
 *   Cruzes whose photos are a .jpg and a .png would not collide on disk, but a
 *   leader looking at the folder needs to see that there are two of them —
 *   "Juan Dela Cruz.jpg" and "Juan Dela Cruz (2).png" says that; two files with
 *   the same visible name does not.
 */
export function uniqueFilename(base: string, ext: string, taken: Set<string>): string {
  const safeBase = sanitizeFilenameBase(base)
  let candidate = safeBase
  let n = 1
  while (taken.has(candidate.toLowerCase())) {
    n += 1
    candidate = `${safeBase} (${n})`
  }
  taken.add(candidate.toLowerCase())
  return `${candidate}.${ext}`
}

/**
 * Name for the archive itself: "baby-photos-ctj-retreat-2026-2026-08-30.zip".
 * ASCII-only and punctuation-free, because this one goes into a
 * Content-Disposition header rather than inside the archive.
 */
export function photoZipFilename(eventName: string | null | undefined, stampedDate: string): string {
  const slug =
    (eventName ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "event"
  return `baby-photos-${slug}-${stampedDate}.zip`
}
