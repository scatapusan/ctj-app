import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock session + service-role client — no DB, no network, no production data.
vi.mock("@/lib/admin-session", () => ({ readSession: vi.fn() }))
vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))

import { readSession } from "@/lib/admin-session"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { GET as photosGET } from "@/app/api/admin/attendance/photos/route"
import { readZip, collectStream } from "../helpers/zip-reader"

const ADMIN = { memberId: "x", email: "a@ctj.test", role: "admin" as const, iat: 0 }
const CORE = { memberId: "y", email: "c@ctj.test", role: "core" as const, iat: 0 }

const EVENT = { id: "e1", name: "CTJ Retreat 2026", event_date: "2026-08-30" }

const JUAN = { id: "m1", first_name: "Juan", last_name: "Dela Cruz" }
const ANA = { id: "m2", first_name: "Ana", last_name: "Reyes" }

function row(id: string, memberId: string, photo: string | null, at = "2026-08-15T02:30:00Z") {
  return { id, member_id: memberId, baby_photo_url: photo, checked_in_at: at }
}

interface Cfg {
  event?: Record<string, unknown> | null
  attendanceRows?: Record<string, unknown>[]
  memberRows?: Record<string, unknown>[]
  attendanceError?: unknown
  memberError?: unknown
  /** stored object path -> the bytes storage hands back */
  photos?: Record<string, Uint8Array>
  /** stored object path -> the content type storage reports */
  photoTypes?: Record<string, string>
  /** stored object paths that fail to download */
  unreadable?: string[]
  onDownload?: (path: string) => void
  onFetch?: (url: string) => void
}

const bytes = (text: string) => new TextEncoder().encode(text)

function makeClient(cfg: Cfg) {
  return {
    from: (table: string) => {
      const qb: Record<string, unknown> = {}
      Object.assign(qb, {
        select: () => qb,
        eq: () => qb,
        in: () => qb,
        order: async () => ({
          data: cfg.attendanceRows ?? [],
          error: cfg.attendanceError ?? null,
        }),
        maybeSingle: async () => ({
          data: cfg.event === undefined ? EVENT : cfg.event,
          error: null,
        }),
        then: (resolve: (v: unknown) => void) =>
          resolve(
            table === "members"
              ? { data: cfg.memberRows ?? [], error: cfg.memberError ?? null }
              : { data: cfg.attendanceRows ?? [], error: cfg.attendanceError ?? null },
          ),
      })
      return qb
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          cfg.onDownload?.(path)
          if (cfg.unreadable?.includes(path)) {
            return { data: null, error: { message: "Object not found" } }
          }
          const data = cfg.photos?.[path] ?? bytes(`bytes of ${path}`)
          return {
            data: new Blob([data as BlobPart], { type: cfg.photoTypes?.[path] ?? "image/jpeg" }),
            error: null,
          }
        },
      }),
    },
  }
}

function use(cfg: Cfg = {}) {
  vi.mocked(createRouteHandlerClient).mockReturnValue(makeClient(cfg) as never)
}

function get(query = "?eventId=e1") {
  return photosGET(new Request(`http://localhost/api/admin/attendance/photos${query}`))
}

async function entriesOf(res: Response) {
  return readZip(await collectStream(res.body))
}

function noteIn(entries: { name: string; data: Uint8Array }[]): string | null {
  const note = entries.find((e) => e.name === "_read-me.txt")
  return note ? new TextDecoder().decode(note.data) : null
}

beforeEach(() => vi.clearAllMocks())

describe("GET /api/admin/attendance/photos — access control", () => {
  const oneRow = {
    attendanceRows: [row("a1", "m1", "baby-1.jpeg")],
    memberRows: [JUAN],
  }

  it("403s without a session", async () => {
    vi.mocked(readSession).mockReturnValue(null)
    use(oneRow)
    expect((await get()).status).toBe(403)
  })

  it("200s for admin", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use(oneRow)
    expect((await get()).status).toBe(200)
  })

  // Same ministry decision as the CSV export: core leaders run the retreat
  // day-of, so they get the same photos. Asserted, so re-narrowing has to be a
  // conscious edit here.
  it("gives CORE the same archive as admin", async () => {
    const archives: string[] = []
    for (const session of [ADMIN, CORE]) {
      vi.mocked(readSession).mockReturnValue(session)
      use(oneRow)
      const res = await get()
      expect(res.status).toBe(200)
      archives.push(
        (await entriesOf(res)).map((e) => `${e.name}:${e.data.length}`).join("|"),
      )
    }
    expect(archives[0]).toBe(archives[1])
    expect(archives[0]).toContain("Juan Dela Cruz.jpeg")
  })

  it("400s without an eventId", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use(oneRow)
    expect((await get("")).status).toBe(400)
  })

  it("404s for an unknown event", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ ...oneRow, event: null })
    expect((await get()).status).toBe(404)
  })

  it("500s when the attendance query fails", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ attendanceError: { message: "boom" } })
    expect((await get()).status).toBe(500)
  })
})

describe("GET /api/admin/attendance/photos — response shape", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(ADMIN))

  it("serves a downloadable zip named after the event", async () => {
    use({ attendanceRows: [row("a1", "m1", "baby-1.jpeg")], memberRows: [JUAN] })
    const res = await get()
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="baby-photos-ctj-retreat-2026-\d{4}-\d{2}-\d{2}\.zip"$/,
    )
  })

  it("forbids caching — these are childhood photos of minors", async () => {
    use({ attendanceRows: [row("a1", "m1", "baby-1.jpeg")], memberRows: [JUAN] })
    expect((await get()).headers.get("Cache-Control")).toContain("no-store")
  })

  it("declares no Content-Length, because the archive is built as it streams", async () => {
    use({ attendanceRows: [row("a1", "m1", "baby-1.jpeg")], memberRows: [JUAN] })
    // A guessed length would truncate the download at the browser.
    expect((await get()).headers.get("Content-Length")).toBeNull()
  })

  it("404s with a readable message when nobody uploaded a photo", async () => {
    use({
      attendanceRows: [row("a1", "m1", null), row("a2", "m2", null)],
      memberRows: [JUAN, ANA],
    })
    const res = await get()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/no baby photos/i)
  })

  it("answers the probe with a count instead of an archive", async () => {
    use({
      attendanceRows: [row("a1", "m1", "baby-1.jpeg"), row("a2", "m2", null)],
      memberRows: [JUAN, ANA],
    })
    const res = await get("?eventId=e1&probe=1")
    expect(res.headers.get("Content-Type")).toContain("application/json")
    expect(await res.json()).toEqual({ ok: true, count: 1 })
  })

  it("refuses the probe for a session that has lapsed", async () => {
    vi.mocked(readSession).mockReturnValue(null)
    use({ attendanceRows: [row("a1", "m1", "baby-1.jpeg")], memberRows: [JUAN] })
    // This is the whole point of the probe: the UI can toast rather than
    // navigating the browser to a page of JSON.
    expect((await get("?eventId=e1&probe=1")).status).toBe(403)
  })
})

describe("GET /api/admin/attendance/photos — naming the files after people", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(ADMIN))

  it("names each entry after the registrant, not the storage object", async () => {
    use({
      attendanceRows: [
        row("a1", "m1", "baby-1786166356633-ej1nor96lw.jpeg"),
        row("a2", "m2", "baby-1786166356634-zzz.png", "2026-08-15T03:00:00Z"),
      ],
      memberRows: [JUAN, ANA],
    })
    const entries = await entriesOf(await get())
    expect(entries.map((e) => e.name)).toEqual(["Juan Dela Cruz.jpeg", "Ana Reyes.png"])
    // And no entry name leaks a storage filename.
    expect(entries.every((e) => !e.name.startsWith("baby-"))).toBe(true)
  })

  it("hands back the actual photo bytes for each person", async () => {
    use({
      attendanceRows: [row("a1", "m1", "baby-1.jpeg"), row("a2", "m2", "baby-2.jpeg")],
      memberRows: [JUAN, ANA],
      photos: { "baby-1.jpeg": bytes("JUAN PIXELS"), "baby-2.jpeg": bytes("ANA PIXELS") },
    })
    const entries = await entriesOf(await get())
    expect(new TextDecoder().decode(entries[0].data)).toBe("JUAN PIXELS")
    expect(new TextDecoder().decode(entries[1].data)).toBe("ANA PIXELS")
  })

  it("numbers two registrants who share a name", async () => {
    use({
      attendanceRows: [
        row("a1", "m1", "baby-1.jpeg"),
        row("a2", "m2", "baby-2.jpeg", "2026-08-15T03:00:00Z"),
      ],
      memberRows: [JUAN, { id: "m2", first_name: "Juan", last_name: "Dela Cruz" }],
    })
    expect((await entriesOf(await get())).map((e) => e.name)).toEqual([
      "Juan Dela Cruz.jpeg",
      "Juan Dela Cruz (2).jpeg",
    ])
  })

  it("keeps a name Windows would reject out of the archive", async () => {
    use({
      attendanceRows: [row("a1", "m1", "baby-1.jpeg")],
      memberRows: [{ id: "m1", first_name: "Ana/Maria", last_name: 'Reyes: "Kid"' }],
    })
    const [entry] = await entriesOf(await get())
    expect(entry.name).toBe("Ana Maria Reyes Kid.jpeg")
    expect(entry.name).not.toMatch(/[<>:"/\\|?*]/)
  })

  it("keeps accented names intact and flags them as UTF-8", async () => {
    use({
      attendanceRows: [row("a1", "m1", "baby-1.jpeg")],
      memberRows: [{ id: "m1", first_name: "José", last_name: "Peñaflor" }],
    })
    const [entry] = await entriesOf(await get())
    expect(entry.name).toBe("José Peñaflor.jpeg")
    expect(entry.flags & 0x0800).toBe(0x0800)
  })

  it("takes the extension from the stored object, falling back to the content type", async () => {
    use({
      attendanceRows: [
        row("a1", "m1", "baby-1.webp"),
        row("a2", "m2", "baby-no-extension", "2026-08-15T03:00:00Z"),
      ],
      memberRows: [JUAN, ANA],
      photoTypes: { "baby-no-extension": "image/png" },
    })
    expect((await entriesOf(await get())).map((e) => e.name)).toEqual([
      "Juan Dela Cruz.webp",
      "Ana Reyes.png",
    ])
  })
})

describe("GET /api/admin/attendance/photos — who is in the archive", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(ADMIN))

  it("skips registrants with no photo without erroring", async () => {
    const downloaded: string[] = []
    use({
      attendanceRows: [
        row("a1", "m1", null),
        row("a2", "m2", "baby-2.jpeg", "2026-08-15T03:00:00Z"),
        row("a3", "m1", "", "2026-08-15T04:00:00Z"),
      ],
      memberRows: [JUAN, ANA],
      onDownload: (p) => downloaded.push(p),
    })
    const res = await get()
    expect(res.status).toBe(200)
    const entries = await entriesOf(res)
    expect(entries.map((e) => e.name)).toEqual(["Ana Reyes.jpeg"])
    // Nothing was even requested from storage for the photoless rows.
    expect(downloaded).toEqual(["baby-2.jpeg"])
  })

  it("keeps check-in order across more photos than the download window", async () => {
    // DOWNLOAD_CONCURRENCY is 4, so anything under five never exercises the
    // refill branch that keeps the window full — where a reordering or a
    // dropped entry would actually show up.
    const many = Array.from({ length: 11 }, (_, i) =>
      row(`a${i}`, `m${i}`, `baby-${i}.jpeg`, `2026-08-15T0${i % 10}:00:00Z`),
    )
    const members = Array.from({ length: 11 }, (_, i) => ({
      id: `m${i}`, first_name: `First${i}`, last_name: `Last${i}`,
    }))
    const photos = Object.fromEntries(many.map((r, i) => [`baby-${i}.jpeg`, bytes(`pixels ${i}`)]))

    use({ attendanceRows: many, memberRows: members, photos })
    const entries = await entriesOf(await get())

    expect(entries).toHaveLength(11)
    expect(entries.map((e) => e.name)).toEqual(
      Array.from({ length: 11 }, (_, i) => `First${i} Last${i}.jpeg`),
    )
    // And each entry still carries ITS OWN bytes, not a neighbour's.
    entries.forEach((e, i) => {
      expect(new TextDecoder().decode(e.data)).toBe(`pixels ${i}`)
    })
  })

  it("reports every failure when several photos are unreadable mid-window", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      row(`a${i}`, `m${i}`, `baby-${i}.jpeg`, `2026-08-15T0${i}:00:00Z`),
    )
    const members = Array.from({ length: 9 }, (_, i) => ({
      id: `m${i}`, first_name: `First${i}`, last_name: `Last${i}`,
    }))
    use({
      attendanceRows: many,
      memberRows: members,
      unreadable: ["baby-1.jpeg", "baby-5.jpeg", "baby-8.jpeg"],
    })
    const entries = await entriesOf(await get())
    expect(entries.filter((e) => e.name !== "_read-me.txt")).toHaveLength(6)
    const note = noteIn(entries)!
    for (const missing of ["First1 Last1", "First5 Last5", "First8 Last8"]) {
      expect(note).toContain(missing)
    }
  })

  it("is scoped to the selected event only", async () => {
    // The route filters by event_id in the query; assert it asks for the id it
    // was given rather than building an archive for everything.
    let asked = ""
    vi.mocked(createRouteHandlerClient).mockReturnValue({
      from: () => {
        const qb: Record<string, unknown> = {}
        Object.assign(qb, {
          select: () => qb,
          eq: (col: string, val: string) => {
            if (col === "event_id") asked = val
            return qb
          },
          in: () => qb,
          order: async () => ({ data: [row("a1", "m1", "baby-1.jpeg")], error: null }),
          maybeSingle: async () => ({ data: EVENT, error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: [JUAN], error: null }),
        })
        return qb
      },
      storage: {
        from: () => ({
          download: async () => ({ data: new Blob([bytes("x")]), error: null }),
        }),
      },
    } as never)
    await get("?eventId=e-other")
    expect(asked).toBe("e-other")
  })

  it("delivers the rest of the archive when one photo cannot be read", async () => {
    use({
      attendanceRows: [
        row("a1", "m1", "baby-gone.jpeg"),
        row("a2", "m2", "baby-2.jpeg", "2026-08-15T03:00:00Z"),
      ],
      memberRows: [JUAN, ANA],
      unreadable: ["baby-gone.jpeg"],
    })
    const entries = await entriesOf(await get())
    expect(entries.map((e) => e.name)).toEqual(["Ana Reyes.jpeg", "_read-me.txt"])
    // And it says who is missing, rather than quietly shipping one fewer photo.
    expect(noteIn(entries)).toContain("Juan Dela Cruz")
  })

  it("adds no note at all when every photo came through", async () => {
    use({
      attendanceRows: [row("a1", "m1", "baby-1.jpeg")],
      memberRows: [JUAN],
    })
    const entries = await entriesOf(await get())
    expect(entries.map((e) => e.name)).toEqual(["Juan Dela Cruz.jpeg"])
  })

  it("warns in the note when a photo is an iPhone HEIC", async () => {
    use({
      attendanceRows: [row("a1", "m1", "baby-1.heic")],
      memberRows: [JUAN],
    })
    const entries = await entriesOf(await get())
    const note = noteIn(entries)
    expect(entries[0].name).toBe("Juan Dela Cruz.heic")
    expect(note).toContain("Juan Dela Cruz.heic")
    expect(note).toMatch(/HEIF Image Extensions/)
  })

  it("still includes a photo whose member row has gone, and says so", async () => {
    use({
      attendanceRows: [row("a1", "m-gone", "baby-1786166356633-ej1nor96lw.jpeg")],
      memberRows: [],
    })
    const entries = await entriesOf(await get())
    expect(entries[0].name).toBe("Unknown - baby-1786166356633-ej1nor96lw.jpeg")
    expect(noteIn(entries)).toContain("COULD NOT BE NAMED")
  })

  it("cannot be made to produce two entries with the same name", async () => {
    use({
      attendanceRows: [
        row("a1", "m1", "baby-1.jpeg"),
        row("a2", "m2", "baby-2.jpeg", "2026-08-15T03:00:00Z"),
        row("a3", "m3", "baby-gone.jpeg", "2026-08-15T04:00:00Z"),
      ],
      // Registrants whose names sanitize to EXACTLY the archive note's base
      // name. Joining first+last with a space would not collide, so the whole
      // name is carried on first_name.
      memberRows: [
        { id: "m1", first_name: "_read-me", last_name: "" },
        { id: "m2", first_name: "_READ-ME", last_name: "" },
        { id: "m3", first_name: "Juan", last_name: "Dela Cruz" },
      ],
      unreadable: ["baby-gone.jpeg"],
    })
    const names = (await entriesOf(await get())).map((e) => e.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    // The note keeps its own name; the two registrants are numbered around it.
    expect(names).toContain("_read-me.txt")
    expect(names).toContain("_read-me (2).jpeg")
    expect(names).toContain("_read-me (3).jpeg")
  })
})

describe("GET /api/admin/attendance/photos — server-side request safety", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(ADMIN))

  // attendance.baby_photo_url reaches the database from a PUBLIC form. If this
  // route fetched whatever it found there, a registrant could make the server
  // request an address of their choosing — an internal metadata endpoint, a
  // tracking URL — and have the reply handed to a leader as a file. Only real
  // bucket objects are ever read.
  it("never fetches an absolute URL found in the photo column", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const downloaded: string[] = []
    use({
      attendanceRows: [
        row("a1", "m1", "http://169.254.169.254/latest/meta-data/"),
        row("a2", "m2", "baby-2.jpeg", "2026-08-15T03:00:00Z"),
      ],
      memberRows: [JUAN, ANA],
      onDownload: (p) => downloaded.push(p),
    })

    const entries = await entriesOf(await get())

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(downloaded).toEqual(["baby-2.jpeg"])
    expect(entries.map((e) => e.name)).toEqual(["Ana Reyes.jpeg", "_read-me.txt"])
    expect(noteIn(entries)).toContain("not a stored photo")
    fetchSpy.mockRestore()
  })

  it("never asks storage for a path that could address another object", async () => {
    // Rows predating the write-side guard were never re-validated, and this
    // value goes to storage.download() under the service-role key.
    const downloaded: string[] = []
    use({
      attendanceRows: [
        row("a1", "m1", "../../other-bucket/secret.jpg"),
        row("a2", "m2", "nested/path/baby.jpg", "2026-08-15T03:00:00Z"),
        row("a3", "m3", "baby-3.jpeg", "2026-08-15T04:00:00Z"),
      ],
      memberRows: [JUAN, ANA, { id: "m3", first_name: "Cara", last_name: "Lim" }],
      onDownload: (p) => downloaded.push(p),
    })
    const entries = await entriesOf(await get())

    expect(downloaded).toEqual(["baby-3.jpeg"])
    expect(entries.map((e) => e.name)).toEqual(["Cara Lim.jpeg", "_read-me.txt"])
    expect(noteIn(entries)).toContain("not a stored photo")
  })
})
