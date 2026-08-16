import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock session + service-role client — no DB, no network, no production data.
vi.mock("@/lib/admin-session", () => ({ readSession: vi.fn() }))
vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))

import { readSession } from "@/lib/admin-session"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { PHOTO_EXPORT_TTL_SECONDS } from "@/lib/photos"
import { GET as exportGET } from "@/app/api/admin/attendance/export/route"

const ADMIN = { memberId: "x", email: "a@ctj.test", role: "admin" as const, iat: 0 }
const CORE = { memberId: "y", email: "c@ctj.test", role: "core" as const, iat: 0 }

const EVENT = { id: "e1", name: "CTJ Retreat 2026", event_date: "2026-08-30" }

const MINOR_ATTENDANCE = {
  id: "a1",
  member_id: "m1",
  status: "registered",
  checked_in_at: "2026-08-15T02:30:00Z",
  attended_at: null,
  category: "youth",
  is_core: false,
  baby_photo_url: null,
  guardian_name: "Maria Dela Cruz",
  guardian_contact: "09181234567",
}
const MINOR_MEMBER = {
  id: "m1",
  first_name: "Juan",
  last_name: "Dela Cruz",
  nickname: "JD",
  email: "juan@ctj.test",
  birthdate: "2010-09-05",
  address: "12 Shoe Ave, Marikina",
  contact_number: "09171234567",
}

interface Cfg {
  event?: Record<string, unknown> | null
  attendanceRows?: Record<string, unknown>[]
  memberRows?: Record<string, unknown>[]
  attendanceError?: unknown
  memberError?: unknown
  signError?: unknown
  onSign?: (paths: string[], ttl: number) => void
}

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
        createSignedUrls: async (paths: string[], ttl: number) => {
          cfg.onSign?.(paths, ttl)
          if (cfg.signError) return { data: null, error: cfg.signError }
          return {
            data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}?token=abc` })),
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
  return exportGET(new Request(`http://localhost/api/admin/attendance/export${query}`))
}

/** Split a single-quoted-cell CSV line back into raw cell values. */
function cells(line: string): string[] {
  return line
    .slice(1, -1)
    .split('","')
    .map((c) => c.replace(/""/g, '"'))
}

async function csvLines(res: Response): Promise<string[]> {
  return (await res.text()).replace(/^﻿/, "").split("\r\n")
}

beforeEach(() => vi.clearAllMocks())

describe("GET /api/admin/attendance/export — access control", () => {
  it("403s without a session", async () => {
    vi.mocked(readSession).mockReturnValue(null)
    use()
    expect((await get()).status).toBe(403)
  })

  it("200s for admin", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    expect((await get()).status).toBe(200)
  })

  // Ministry decision, made deliberately after the admin-only version shipped:
  // core leaders run the retreat day-of and get the identical file, addresses
  // and guardian contacts included. Asserted rather than assumed so that
  // re-narrowing the gate has to be a conscious edit to this test.
  it("gives CORE the same full export as admin, PII included", async () => {
    const bodies: string[] = []
    for (const session of [ADMIN, CORE]) {
      vi.mocked(readSession).mockReturnValue(session)
      use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
      const res = await get()
      expect(res.status).toBe(200)
      const lines = await csvLines(res)
      const c = cells(lines[1])
      expect(c[7]).toBe("12 Shoe Ave, Marikina") // Address
      expect(c[8]).toBe("09171234567") // Contact Number
      expect(c[10]).toBe("09181234567") // Guardian Contact
      bodies.push(lines.join("\r\n"))
    }
    expect(bodies[0]).toBe(bodies[1])
  })

  it("400s without an eventId", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use()
    expect((await get("")).status).toBe(400)
  })

  it("404s for an unknown event", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ event: null })
    expect((await get()).status).toBe(404)
  })

  it("500s rather than sending a partial file when the query fails", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ attendanceError: { message: "boom" } })
    expect((await get()).status).toBe(500)
  })
})

describe("GET /api/admin/attendance/export — response shape", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(ADMIN))

  it("serves a downloadable CSV named after the event", async () => {
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    const res = await get()
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="attendance-ctj-retreat-2026-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
  })

  it("forbids caching — the file carries minors' contact details", async () => {
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    expect((await get()).headers.get("Cache-Control")).toContain("no-store")
  })

  it("leads with a UTF-8 BOM so Excel renders accented names correctly", async () => {
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    // Checked on the raw bytes: Response.text() performs a UTF-8 decode, which
    // strips a leading BOM per the Fetch spec, so it can never observe one.
    const bytes = new Uint8Array(await (await get()).arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
  })

  it("returns a header-only CSV for an event nobody registered for", async () => {
    use({ attendanceRows: [], memberRows: [] })
    const lines = await csvLines(await get())
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('"Guardian Contact"')
  })
})

describe("GET /api/admin/attendance/export — every submitted field", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(ADMIN))

  it("joins the member record so birthday, address and contact number are present", async () => {
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    const [, line] = await csvLines(await get())
    const c = cells(line)
    expect(c[0]).toBe("Juan Dela Cruz")
    expect(c[1]).toBe("JD")
    expect(c[2]).toBe("juan@ctj.test")
    expect(c[5]).toBe("2010-09-05") // Birthday
    expect(c[7]).toBe("12 Shoe Ave, Marikina") // Address
    expect(c[8]).toBe("09171234567") // Contact Number
  })

  it("carries the guardian details that no admin screen currently shows", async () => {
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    const c = cells((await csvLines(await get()))[1])
    expect(c[9]).toBe("Maria Dela Cruz")
    expect(c[10]).toBe("09181234567")
  })

  it("computes age as of the EVENT date, not today", async () => {
    // Born 2010-09-05, retreat 2026-08-30: still 15 on the day, 16 a week later.
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    expect(cells((await csvLines(await get()))[1])[6]).toBe("15")
  })

  it("exports both a permanent filename and a signed link for the baby photo", async () => {
    use({
      attendanceRows: [{ ...MINOR_ATTENDANCE, category: "ya", baby_photo_url: "baby-123.jpeg" }],
      memberRows: [MINOR_MEMBER],
    })
    const c = cells((await csvLines(await get()))[1])
    expect(c[11]).toBe("baby-123.jpeg")
    expect(c[12]).toBe("https://signed.test/baby-123.jpeg?token=abc")
  })

  it("signs photo links with the long export TTL, not the 10-minute page TTL", async () => {
    let seenTtl: number | undefined
    use({
      attendanceRows: [{ ...MINOR_ATTENDANCE, baby_photo_url: "baby-123.jpeg" }],
      memberRows: [MINOR_MEMBER],
      onSign: (_paths, ttl) => { seenTtl = ttl },
    })
    await get()
    expect(seenTtl).toBe(PHOTO_EXPORT_TTL_SECONDS)
  })

  it("still exports the row when photo signing fails", async () => {
    use({
      attendanceRows: [{ ...MINOR_ATTENDANCE, baby_photo_url: "baby-123.jpeg" }],
      memberRows: [MINOR_MEMBER],
      signError: { message: "storage down" },
    })
    const res = await get()
    expect(res.status).toBe(200)
    const c = cells((await csvLines(res))[1])
    expect(c[11]).toBe("baby-123.jpeg")
    expect(c[12]).toBe("")
  })

  it("exports a registrant with no photo without inventing a link", async () => {
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    const c = cells((await csvLines(await get()))[1])
    expect(c[11]).toBe("")
    expect(c[12]).toBe("")
  })

  it("exports one line per registration, in check-in order", async () => {
    use({
      attendanceRows: [
        MINOR_ATTENDANCE,
        { ...MINOR_ATTENDANCE, id: "a2", member_id: "m2", status: "attended", attended_at: "2026-08-30T01:05:00Z" },
      ],
      memberRows: [MINOR_MEMBER, { ...MINOR_MEMBER, id: "m2", first_name: "Ana", nickname: null }],
    })
    const lines = await csvLines(await get())
    expect(lines).toHaveLength(3)
    expect(cells(lines[1])[0]).toBe("Juan Dela Cruz")
    expect(cells(lines[2])[0]).toBe("Ana Dela Cruz")
    expect(cells(lines[2])[4]).toBe("Attended")
  })

  it("does not drop a registration whose member row is missing", async () => {
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [] })
    const lines = await csvLines(await get())
    expect(lines).toHaveLength(2)
    expect(cells(lines[1])[0]).toBe("Unknown")
    // The attendance-side answers survive so the row is still actionable.
    expect(cells(lines[1])[9]).toBe("Maria Dela Cruz")
  })

  it("keeps a comma-bearing address in a single cell", async () => {
    use({ attendanceRows: [MINOR_ATTENDANCE], memberRows: [MINOR_MEMBER] })
    const lines = await csvLines(await get())
    expect(cells(lines[1])).toHaveLength(cells(lines[0]).length)
  })

  it("defuses a formula typed into the address field", async () => {
    use({
      attendanceRows: [MINOR_ATTENDANCE],
      memberRows: [{ ...MINOR_MEMBER, address: '=HYPERLINK("http://evil.test","click")' }],
    })
    const c = cells((await csvLines(await get()))[1])
    expect(c[7].startsWith("'=")).toBe(true)
  })
})
