import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock session + service-role client — no DB, no network, no production data.
vi.mock("@/lib/admin-session", () => ({ readSession: vi.fn() }))
vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))

import { readSession } from "@/lib/admin-session"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { PHOTO_URL_TTL_SECONDS } from "@/lib/photos"
import { GET as detailGET } from "@/app/api/admin/attendance/[id]/route"

const ADMIN = { memberId: "x", email: "a@ctj.test", role: "admin" as const, iat: 0 }
const CORE = { memberId: "y", email: "c@ctj.test", role: "core" as const, iat: 0 }

const EVENT = { id: "e1", name: "CTJ Retreat 2026", event_date: "2026-08-30" }

const ATTENDANCE = {
  id: "a1",
  member_id: "m1",
  event_id: "e1",
  status: "registered",
  checked_in_at: "2026-08-15T02:30:00Z",
  attended_at: null,
  category: "youth",
  is_core: false,
  baby_photo_url: null,
  guardian_name: "Maria Dela Cruz",
  guardian_contact: "09181234567",
}

const MEMBER = {
  id: "m1",
  first_name: "Juan",
  middle_name: "Santos",
  last_name: "Dela Cruz",
  nickname: "JD",
  email: "juan@ctj.test",
  birthdate: "2010-09-05",
  address: "12 Shoe Ave, Marikina",
  contact_number: "09171234567",
}

interface Cfg {
  attendance?: Record<string, unknown> | null
  member?: Record<string, unknown> | null
  event?: Record<string, unknown> | null
  attendanceError?: unknown
  signError?: unknown
  onSign?: (path: string, ttl: number) => void
}

function makeClient(cfg: Cfg) {
  return {
    from: (table: string) => {
      const qb: Record<string, unknown> = {}
      Object.assign(qb, {
        select: () => qb,
        eq: () => qb,
        maybeSingle: async () => {
          if (table === "attendance") {
            return {
              data: cfg.attendance === undefined ? ATTENDANCE : cfg.attendance,
              error: cfg.attendanceError ?? null,
            }
          }
          if (table === "members") {
            return { data: cfg.member === undefined ? MEMBER : cfg.member, error: null }
          }
          return { data: cfg.event === undefined ? EVENT : cfg.event, error: null }
        },
      })
      return qb
    },
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, ttl: number) => {
          cfg.onSign?.(path, ttl)
          if (cfg.signError) return { data: null, error: cfg.signError }
          return { data: { signedUrl: `https://signed.test/${path}?token=abc` }, error: null }
        },
      }),
    },
  }
}

function use(cfg: Cfg = {}) {
  vi.mocked(createRouteHandlerClient).mockReturnValue(makeClient(cfg) as never)
}

function get(id = "a1") {
  return detailGET(new Request(`http://localhost/api/admin/attendance/${id}`), {
    params: { id },
  })
}

async function record(res: Response) {
  return (await res.json()).record as Record<string, unknown>
}

beforeEach(() => vi.clearAllMocks())

describe("GET /api/admin/attendance/[id] — access control", () => {
  it("403s without a session", async () => {
    vi.mocked(readSession).mockReturnValue(null)
    use()
    expect((await get()).status).toBe(403)
  })

  it("200s for admin", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use()
    expect((await get()).status).toBe(200)
  })

  // The ministry's decision, the same one recorded on the CSV export: core
  // leaders run the retreat day-of and get the identical record, addresses and
  // guardian contacts included. Asserted so that narrowing it later has to be a
  // conscious edit to this test.
  it("gives CORE the identical record to admin, PII included", async () => {
    const bodies: string[] = []
    for (const session of [ADMIN, CORE]) {
      vi.mocked(readSession).mockReturnValue(session)
      use()
      const res = await get()
      expect(res.status).toBe(200)
      bodies.push(await res.text())
    }
    expect(bodies[0]).toBe(bodies[1])
    const parsed = JSON.parse(bodies[1]).record
    expect(parsed.address).toBe("12 Shoe Ave, Marikina")
    expect(parsed.contactNumber).toBe("09171234567")
    expect(parsed.guardianContact).toBe("09181234567")
  })

  it("never caches — the record carries a minor's address and guardian number", async () => {
    vi.mocked(readSession).mockReturnValue(CORE)
    use()
    expect((await get()).headers.get("Cache-Control")).toContain("no-store")
  })

  it("404s for a registration that is gone", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ attendance: null })
    expect((await get()).status).toBe(404)
  })

  it("500s rather than returning a half-built record when the query fails", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ attendance: null, attendanceError: { message: "boom" } })
    expect((await get()).status).toBe(500)
  })
})

describe("GET /api/admin/attendance/[id] — the record", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(ADMIN))

  it("carries every field the retreat form collects", async () => {
    use()
    const r = await record(await get())
    expect(r.name).toBe("Juan Dela Cruz")
    expect(r.nickname).toBe("JD")
    expect(r.middleName).toBe("Santos")
    expect(r.email).toBe("juan@ctj.test")
    expect(r.birthdate).toBe("2010-09-05")
    expect(r.address).toBe("12 Shoe Ave, Marikina")
    expect(r.contactNumber).toBe("09171234567")
    expect(r.guardianName).toBe("Maria Dela Cruz")
    expect(r.guardianContact).toBe("09181234567")
    expect(r.status).toBe("registered")
    expect(r.registeredAt).toBe("2026-08-15T02:30:00Z")
  })

  // Freezes the payload shape the detail panel reads. A renamed key would
  // otherwise show up as a silently blank field on screen rather than an error.
  it("returns exactly the documented key set", async () => {
    use()
    expect(Object.keys(await record(await get())).sort()).toEqual(
      [
        "address", "age", "attendedAt", "babyPhotoUrl", "birthdate", "category",
        "categoryLabel", "contactNumber", "email", "eventDate", "eventId",
        "eventName", "firstName", "guardianContact", "guardianName",
        "hasBabyPhoto", "id", "isCore", "lastName", "memberId", "middleName",
        "name", "nickname", "registeredAt", "status",
      ].sort(),
    )
  })

  it("computes age as of the EVENT date, not today", async () => {
    // Born 2010-09-05, retreat 2026-08-30: still 15 on the day, 16 a week later.
    use()
    expect((await record(await get())).age).toBe(15)
  })

  it("falls back to today's date when the event has no usable date", async () => {
    use({ event: { ...EVENT, event_date: "not-a-date" } })
    // Still a number rather than null — the person has a birthday either way.
    expect(typeof (await record(await get())).age).toBe("number")
  })

  it("leaves age null for a registrant with no birthday on file", async () => {
    use({ member: { ...MEMBER, birthdate: null } })
    const r = await record(await get())
    expect(r.age).toBeNull()
    expect(r.birthdate).toBeNull()
  })

  it("labels the category the way the screens do", async () => {
    use()
    expect((await record(await get())).categoryLabel).toBe("Youth")

    use({ attendance: { ...ATTENDANCE, category: "ya", is_core: true } })
    const core = await record(await get())
    // Core wins the label but the age bracket is not lost.
    expect(core.categoryLabel).toBe("Core")
    expect(core.category).toBe("ya")
    expect(core.isCore).toBe(true)
  })

  it("signs the baby photo with the short page TTL, not the 7-day export one", async () => {
    let seenTtl: number | undefined
    use({
      attendance: { ...ATTENDANCE, baby_photo_url: "baby-123.jpeg" },
      onSign: (_path, ttl) => {
        seenTtl = ttl
      },
    })
    const r = await record(await get())
    expect(r.babyPhotoUrl).toBe("https://signed.test/baby-123.jpeg?token=abc")
    expect(r.hasBabyPhoto).toBe(true)
    expect(seenTtl).toBe(PHOTO_URL_TTL_SECONDS)
  })

  it("reports a photo on file even when signing it fails", async () => {
    use({
      attendance: { ...ATTENDANCE, baby_photo_url: "baby-123.jpeg" },
      signError: { message: "storage down" },
    })
    const r = await record(await get())
    // The panel can then say 'photo unavailable' instead of 'no photo'.
    expect(r.hasBabyPhoto).toBe(true)
    expect(r.babyPhotoUrl).toBeNull()
  })

  // attendance.baby_photo_url is written from a PUBLIC form. A value that is a
  // URL rather than a bucket object did not come from our upload route, and
  // rendering it would point an admin's browser at an address a registrant
  // chose. It is reported as unavailable instead.
  it("refuses to render a photo value that is an arbitrary address", async () => {
    let signed = false
    use({
      attendance: { ...ATTENDANCE, baby_photo_url: "https://tracker.test/pixel.gif" },
      onSign: () => {
        signed = true
      },
    })
    const r = await record(await get())
    expect(r.babyPhotoUrl).toBeNull()
    expect(signed).toBe(false)
    // Still reported as "has a photo", so the panel says unavailable rather
    // than pretending the registrant never uploaded one.
    expect(r.hasBabyPhoto).toBe(true)
  })

  it("invents no photo for a registrant who never uploaded one", async () => {
    use()
    const r = await record(await get())
    expect(r.hasBabyPhoto).toBe(false)
    expect(r.babyPhotoUrl).toBeNull()
  })

  it("still returns the registration when the member row has gone", async () => {
    use({ member: null })
    const r = await record(await get())
    expect(r.name).toBe("Unknown")
    expect(r.email).toBeNull()
    // The answers stored on the registration itself survive, so the row is
    // still actionable — a guardian's number is the reason to open this screen.
    expect(r.guardianName).toBe("Maria Dela Cruz")
    expect(r.guardianContact).toBe("09181234567")
  })

  it("treats a pre-migration row with no status column as attended", async () => {
    const legacy = { ...ATTENDANCE } as Record<string, unknown>
    delete legacy.status
    use({ attendance: legacy })
    expect((await record(await get())).status).toBe("attended")
  })
})
