import { describe, it, expect } from "vitest"
import {
  sanitizeFilenameBase,
  extensionForPhoto,
  uniqueFilename,
  photoZipFilename,
  FALLBACK_BASE,
} from "@/lib/photo-filenames"

/**
 * The baby-photo archive is named after the people in the photos, so these
 * rules are the whole feature: get a name wrong and the file either fails to
 * extract on Windows or silently overwrites somebody else's photo.
 */

describe("sanitizeFilenameBase", () => {
  it("leaves an ordinary Filipino name exactly as typed", () => {
    expect(sanitizeFilenameBase("Juan Dela Cruz")).toBe("Juan Dela Cruz")
  })

  it("keeps accented characters — that is the person's actual name", () => {
    expect(sanitizeFilenameBase("José Peñaflor")).toBe("José Peñaflor")
    expect(sanitizeFilenameBase("Ramírez Dueñas")).toBe("Ramírez Dueñas")
  })

  it("keeps the punctuation real names contain", () => {
    expect(sanitizeFilenameBase("Mary-Jane O'Brien")).toBe("Mary-Jane O'Brien")
    expect(sanitizeFilenameBase("Jose Rizal Jr.")).toBe("Jose Rizal Jr")
    expect(sanitizeFilenameBase("Ma. Teresa Santos")).toBe("Ma. Teresa Santos")
  })

  it("strips every character Windows forbids", () => {
    // A slash would create a directory (or fail outright); the rest are
    // rejected by the Win32 API.
    expect(sanitizeFilenameBase('Juan/Dela\\Cruz')).toBe("Juan Dela Cruz")
    expect(sanitizeFilenameBase('Ana: "The Kid" <Reyes>')).toBe("Ana The Kid Reyes")
    expect(sanitizeFilenameBase("Who? Star* Pipe|")).toBe("Who Star Pipe")
  })

  it("strips control characters and collapses pasted newlines", () => {
    expect(sanitizeFilenameBase("Juan\nDela\tCruz")).toBe("Juan Dela Cruz")
    expect(sanitizeFilenameBase("Ana\u0000Reyes")).toBe("Ana Reyes")
    expect(sanitizeFilenameBase("Ben\u001fCruz")).toBe("Ben Cruz")
    expect(sanitizeFilenameBase("Cara\u007fLim")).toBe("Cara Lim")
  })

  it("collapses runs of whitespace and trims the ends", () => {
    expect(sanitizeFilenameBase("  Juan   Dela    Cruz  ")).toBe("Juan Dela Cruz")
  })

  it("removes trailing dots and spaces, which Windows drops silently", () => {
    expect(sanitizeFilenameBase("Juan Dela Cruz.")).toBe("Juan Dela Cruz")
    expect(sanitizeFilenameBase("Juan Dela Cruz...")).toBe("Juan Dela Cruz")
    expect(sanitizeFilenameBase("Juan Dela Cruz ")).toBe("Juan Dela Cruz")
  })

  it("removes a leading dot, which would hide the file on macOS and Linux", () => {
    expect(sanitizeFilenameBase(".Juan")).toBe("Juan")
    expect(sanitizeFilenameBase("..Juan")).toBe("Juan")
  })

  it("escapes MS-DOS device names that Windows still refuses to create", () => {
    // Prefixed rather than suffixed: Windows applies the rule to everything
    // before the first dot, so a trailing underscore would not save "Con.Jr".
    expect(sanitizeFilenameBase("CON")).toBe("_CON")
    expect(sanitizeFilenameBase("aux")).toBe("_aux")
    expect(sanitizeFilenameBase("Com1")).toBe("_Com1")
    expect(sanitizeFilenameBase("LPT9")).toBe("_LPT9")
    expect(sanitizeFilenameBase("Con.Jr")).toBe("_Con.Jr")
    expect(sanitizeFilenameBase("nul.something")).toBe("_nul.something")
    // A real name that merely starts with one is fine.
    expect(sanitizeFilenameBase("Conrad Nulla")).toBe("Conrad Nulla")
    expect(sanitizeFilenameBase("Con Reyes")).toBe("Con Reyes")
  })

  it("folds the two Unicode spellings of an accented name together", () => {
    // NFD (e + U+0301) and NFC (U+00E9) look identical and collide on macOS.
    const nfd = sanitizeFilenameBase("Jose\u0301 Pen\u0303aflor")
    const nfc = sanitizeFilenameBase("Jos\u00e9 Pe\u00f1aflor")
    expect(nfd).toBe(nfc)
    expect(nfd).toBe("José Peñaflor")
  })

  it("falls back rather than producing an empty file name", () => {
    expect(sanitizeFilenameBase("")).toBe(FALLBACK_BASE)
    expect(sanitizeFilenameBase(null)).toBe(FALLBACK_BASE)
    expect(sanitizeFilenameBase(undefined)).toBe(FALLBACK_BASE)
    expect(sanitizeFilenameBase("   ")).toBe(FALLBACK_BASE)
    expect(sanitizeFilenameBase("///")).toBe(FALLBACK_BASE)
    expect(sanitizeFilenameBase("...")).toBe(FALLBACK_BASE)
  })

  it("does not split an emoji in half when it trims a long name", () => {
    // Trimming cuts at UTF-16 code units, and half a surrogate pair encodes as
    // a literal replacement character in the archive entry name.
    const trimmed = sanitizeFilenameBase("A".repeat(79) + "\u{1F600}" + "Bautista")
    expect(trimmed).toBe("A".repeat(79))
    expect(new TextDecoder().decode(new TextEncoder().encode(trimmed))).toBe(trimmed)
  })

  it("keeps an emoji that fits inside the cap", () => {
    expect(sanitizeFilenameBase("Ana \u{1F600} Reyes")).toBe("Ana \u{1F600} Reyes")
  })

  it("caps an absurdly long name so the extracted path stays openable", () => {
    const long = sanitizeFilenameBase("Bartolome ".repeat(40))
    expect(long.length).toBeLessThanOrEqual(80)
    // And never ends mid-space, which Windows would trim anyway.
    expect(long).toBe(long.trim())
  })
})

describe("extensionForPhoto", () => {
  it("takes the extension from the stored object path", () => {
    expect(extensionForPhoto("baby-1786166356633-ej1nor96lw.jpeg")).toBe("jpeg")
    expect(extensionForPhoto("baby-1786166356633-abc.png")).toBe("png")
    expect(extensionForPhoto("baby-1.webp")).toBe("webp")
    expect(extensionForPhoto("baby-1.HEIC")).toBe("heic")
  })

  it("handles a legacy absolute URL, query string and all", () => {
    expect(
      extensionForPhoto("https://x.supabase.co/storage/v1/object/public/member-photos/baby-9.jpg?t=1"),
    ).toBe("jpg")
    expect(extensionForPhoto("https://x.test/photos/baby-9.png#frag")).toBe("png")
  })

  it("uses the reported content type when the path has no usable extension", () => {
    expect(extensionForPhoto("baby-no-extension", "image/png")).toBe("png")
    expect(extensionForPhoto("baby.bin", "image/webp")).toBe("webp")
    expect(extensionForPhoto("baby.bin", "image/jpeg; charset=binary")).toBe("jpg")
  })

  it("never returns something off Object.prototype as an extension", () => {
    // A bare lookup on a plain object resolves 'constructor' to a function.
    expect(extensionForPhoto("baby.bin", "constructor")).toBe("jpg")
    expect(extensionForPhoto("baby.bin", "toString")).toBe("jpg")
    expect(extensionForPhoto("baby.bin", "__proto__")).toBe("jpg")
  })

  it("defaults to jpg rather than emitting an extensionless file", () => {
    expect(extensionForPhoto(null)).toBe("jpg")
    expect(extensionForPhoto("")).toBe("jpg")
    expect(extensionForPhoto("baby.bin")).toBe("jpg")
    expect(extensionForPhoto("baby.bin", "application/octet-stream")).toBe("jpg")
  })

  it("ignores a dotfile-style path with no real extension", () => {
    expect(extensionForPhoto(".hidden")).toBe("jpg")
  })
})

describe("uniqueFilename", () => {
  it("names the first photo plainly after the person", () => {
    const taken = new Set<string>()
    expect(uniqueFilename("Juan Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz.jpg")
  })

  it("numbers a second registrant with the same name", () => {
    const taken = new Set<string>()
    expect(uniqueFilename("Juan Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz.jpg")
    expect(uniqueFilename("Juan Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz (2).jpg")
    expect(uniqueFilename("Juan Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz (3).jpg")
  })

  it("treats differently-cased names as the same file, as Windows does", () => {
    const taken = new Set<string>()
    expect(uniqueFilename("Juan Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz.jpg")
    expect(uniqueFilename("juan dela cruz", "jpg", taken)).toBe("juan dela cruz (2).jpg")
  })

  it("still distinguishes two namesakes whose photos are different formats", () => {
    // They would not collide on disk, but a leader looking at the folder has to
    // be able to see that there are two Juans.
    const taken = new Set<string>()
    expect(uniqueFilename("Juan Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz.jpg")
    expect(uniqueFilename("Juan Dela Cruz", "png", taken)).toBe("Juan Dela Cruz (2).png")
  })

  it("sanitizes before deduplicating, so two mangled names cannot collide", () => {
    const taken = new Set<string>()
    expect(uniqueFilename("Juan/Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz.jpg")
    expect(uniqueFilename("Juan\\Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz (2).jpg")
  })

  it("numbers the fallback name when several records have no name at all", () => {
    const taken = new Set<string>()
    expect(uniqueFilename("", "jpg", taken)).toBe("Unnamed.jpg")
    expect(uniqueFilename("   ", "jpg", taken)).toBe("Unnamed (2).jpg")
  })

  it("does not renumber a name that only looks like a numbered duplicate", () => {
    const taken = new Set<string>()
    expect(uniqueFilename("Juan Dela Cruz (2)", "jpg", taken)).toBe("Juan Dela Cruz (2).jpg")
    expect(uniqueFilename("Juan Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz.jpg")
    // The next real duplicate skips past the name already taken.
    expect(uniqueFilename("Juan Dela Cruz", "jpg", taken)).toBe("Juan Dela Cruz (3).jpg")
  })

  it("produces no duplicate entry names across a whole archive", () => {
    const taken = new Set<string>()
    const names = [
      "Juan Dela Cruz", "Juan Dela Cruz", "JUAN DELA CRUZ", "Ana Reyes",
      "", "  ", "Juan/Dela Cruz", "Ana Reyes.",
    ].map((n) => uniqueFilename(n, "jpg", taken))
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length)
  })
})

describe("photoZipFilename", () => {
  it("slugs the event name and stamps the date", () => {
    expect(photoZipFilename("CTJ Retreat 2026", "2026-08-30")).toBe(
      "baby-photos-ctj-retreat-2026-2026-08-30.zip",
    )
  })

  it("stays header-safe for an event name full of punctuation", () => {
    const name = photoZipFilename('Retreat "2026": Youth/YA', "2026-08-30")
    expect(name).toBe("baby-photos-retreat-2026-youth-ya-2026-08-30.zip")
    expect(name).not.toMatch(/["\\/\r\n]/)
  })

  it("falls back for a missing event name", () => {
    expect(photoZipFilename(null, "2026-08-30")).toBe("baby-photos-event-2026-08-30.zip")
    expect(photoZipFilename("!!!", "2026-08-30")).toBe("baby-photos-event-2026-08-30.zip")
  })
})
