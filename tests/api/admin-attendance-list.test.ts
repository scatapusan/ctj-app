import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock session + service-role client — no DB, no network, no production data.
vi.mock("@/lib/admin-session", () => ({ readSession: vi.fn() }))
vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))

import { readSession } from "@/lib/admin-session"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { GET as listGET } from "@/app/api/admin/attendance/route"

const ADMIN = { memberId: "x", email: "a@ctj.test", role: "admin" as const, iat: 0 }
const CORE = { memberId: "y", email: "c@ctj.test", role: "core" as const, iat: 0 }

const JUAN = { id: "m1", first_name: "Juan", last_name: "Dela Cruz", email: "juan@ctj.test" }
const ANA = { id: "m2", first_name: "Ana", last_name: "Reyes", email: "ana@ctj.test" }

function row(id: string, memberId: string, photo: string | null) {
  return {
    id,
    member_id: memberId,
    checked_in_at: "2026-08-15T02:30:00Z",
    status: "registered",
    attended_at: null,
    category: "ya",
    is_core: false,
    baby_photo_url: photo,
  }
}

interface Cfg {
  attendanceRows?: Record<string, unknown>[]
  memberRows?: Record<string, unknown>[]
  attendanceError?: unknown
}

function use(cfg: Cfg = {}) {
  vi.mocked(createRouteHandlerClient).mockReturnValue({
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
        then: (resolve: (v: unknown) => void) =>
          resolve(
            table === "members"
              ? { data: cfg.memberRows ?? [], error: null }
              : { data: cfg.attendanceRows ?? [], error: cfg.attendanceError ?? null },
          ),
      })
      return qb
    },
  } as never)
}

function get(query = "?eventId=e1") {
  return listGET(new Request(`http://localhost/api/admin/attendance${query}`))
}

async function records(res: Response) {
  return (await res.json()).records as Record<string, unknown>[]
}

beforeEach(() => vi.clearAllMocks())

describe("GET /api/admin/attendance — access control", () => {
  it("403s without a session", async () => {
    vi.mocked(readSession).mockReturnValue(null)
    use()
    expect((await get()).status).toBe(403)
  })

  it("serves admin and core the identical list", async () => {
    const bodies: string[] = []
    for (const session of [ADMIN, CORE]) {
      vi.mocked(readSession).mockReturnValue(session)
      use({ attendanceRows: [row("a1", "m1", "baby-1.jpeg")], memberRows: [JUAN] })
      const res = await get()
      expect(res.status).toBe(200)
      bodies.push(await res.text())
    }
    expect(bodies[0]).toBe(bodies[1])
  })

  it("500s when the query fails", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ attendanceError: { message: "boom" } })
    expect((await get()).status).toBe(500)
  })

  it("returns an empty list rather than erroring without an eventId", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use()
    const res = await get("")
    expect(res.status).toBe(200)
    expect(await records(res)).toEqual([])
  })
})

describe("GET /api/admin/attendance — the row shape", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(CORE))

  // has_baby_photo drives the row marker AND the count on the download button,
  // which is what tells a leader whether the archive is worth downloading.
  it("reports who has a baby photo on file, without exposing the photo", async () => {
    use({
      attendanceRows: [
        row("a1", "m1", "baby-1786166356633-ej1nor96lw.jpeg"),
        row("a2", "m2", null),
      ],
      memberRows: [JUAN, ANA],
    })
    const rows = await records(await get())
    expect(rows.map((r) => r.has_baby_photo)).toEqual([true, false])
    // The path itself never reaches the browser — the list is PII-free and the
    // photo is fetched one registrant at a time by the detail route.
    expect(JSON.stringify(rows)).not.toContain("baby-1786166356633")
  })

  it("treats an empty photo value as no photo", async () => {
    use({ attendanceRows: [row("a1", "m1", "")], memberRows: [JUAN] })
    expect((await records(await get()))[0].has_baby_photo).toBe(false)
  })

  it("carries no address, contact number or guardian details", async () => {
    use({ attendanceRows: [row("a1", "m1", "baby-1.jpeg")], memberRows: [JUAN] })
    const keys = Object.keys((await records(await get()))[0]).sort()
    expect(keys).toEqual(
      [
        "attended_at", "category", "checked_in_at", "email", "has_baby_photo",
        "id", "is_core", "member_name", "status",
      ].sort(),
    )
  })

  it("names the registrant from the member join", async () => {
    use({ attendanceRows: [row("a1", "m1", null)], memberRows: [JUAN] })
    const [r] = await records(await get())
    expect(r.member_name).toBe("Juan Dela Cruz")
    expect(r.email).toBe("juan@ctj.test")
  })

  it("keeps a registration whose member row has gone", async () => {
    use({ attendanceRows: [row("a1", "m-gone", "baby-1.jpeg")], memberRows: [] })
    const [r] = await records(await get())
    expect(r.member_name).toBe("Unknown")
    expect(r.has_baby_photo).toBe(true)
  })

  it("treats a pre-migration row with no status column as attended", async () => {
    const legacy = row("a1", "m1", null) as Record<string, unknown>
    delete legacy.status
    use({ attendanceRows: [legacy], memberRows: [JUAN] })
    expect((await records(await get()))[0].status).toBe("attended")
  })
})
