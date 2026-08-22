import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock session, service-role client, and Sheets — no DB / network / prod.
vi.mock("@/lib/admin-session", () => ({ readSession: vi.fn() }))
vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))
vi.mock("@/lib/attend-sheets", () => ({
  pushAttendanceToSheets: vi.fn(async () => {}),
  pushRegistrationToSheets: vi.fn(async () => {}),
}))

import { readSession } from "@/lib/admin-session"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { pushAttendanceToSheets } from "@/lib/attend-sheets"
import {
  GET as rosterGET,
  POST as markPOST,
  DELETE as unmarkDELETE,
} from "@/app/api/admin/checkin/route"

const ADMIN = { memberId: "x", email: "a@ctj.test", role: "admin" as const, iat: 0 }
const CORE = { memberId: "y", email: "c@ctj.test", role: "core" as const, iat: 0 }

interface Cfg {
  attendanceRow?: Record<string, unknown> | null
  memberRow?: Record<string, unknown> | null
  rosterRows?: Record<string, unknown>[]
  memberRows?: Record<string, unknown>[]
  onUpdate?: (payload: Record<string, unknown>, filters: Record<string, string>) => void
  updateError?: unknown
  /** Object paths storage is asked to sign — captured to prove what is sent. */
  onSign?: (paths: string[]) => void
}

function makeClient(cfg: Cfg) {
  return {
    from: (table: string) => {
      const filters: Record<string, string> = {}
      const qb: Record<string, unknown> = {}
      let pendingUpdate: Record<string, unknown> | null = null
      Object.assign(qb, {
        select: () => qb,
        in: () => qb,
        order: async () => ({
          data: table === "attendance" ? (cfg.rosterRows ?? []) : (cfg.memberRows ?? []),
          error: null,
        }),
        update: (payload: Record<string, unknown>) => {
          pendingUpdate = payload
          return qb
        },
        eq: (col: string, val: string) => {
          filters[col] = val
          // The update chain's final .eq() is awaited directly.
          if (pendingUpdate) {
            const p = pendingUpdate
            return {
              eq: (col2: string, val2: string) => {
                filters[col2] = val2
                cfg.onUpdate?.(p, { ...filters })
                return Promise.resolve({ error: cfg.updateError ?? null })
              },
            }
          }
          return qb
        },
        maybeSingle: async () => {
          if (table === "attendance") return { data: cfg.attendanceRow ?? null, error: null }
          return { data: cfg.memberRow ?? null, error: null }
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({
            data: table === "attendance" ? (cfg.rosterRows ?? []) : (cfg.memberRows ?? []),
            error: null,
          }),
      })
      return qb
    },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          cfg.onSign?.(paths)
          return {
            data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}?token=abc` })),
            error: null,
          }
        },
      }),
    },
  }
}

function use(cfg: Cfg) {
  vi.mocked(createRouteHandlerClient).mockReturnValue(makeClient(cfg) as never)
}

function markReq(body: unknown) {
  return new Request("http://localhost/api/admin/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe("GET /api/admin/checkin", () => {
  it("403s without a session", async () => {
    vi.mocked(readSession).mockReturnValue(null)
    const res = await rosterGET(new Request("http://localhost/api/admin/checkin?eventId=e1"))
    expect(res.status).toBe(403)
  })

  it("returns the joined roster for admin and core", async () => {
    for (const session of [ADMIN, CORE]) {
      vi.mocked(readSession).mockReturnValue(session)
      use({
        rosterRows: [
          { id: "a1", member_id: "m1", status: "registered", checked_in_at: "t", attended_at: null, category: "youth", guardian_name: "G", guardian_contact: "0917" },
        ],
        memberRows: [{ id: "m1", first_name: "Juan", last_name: "DelaCruz", nickname: "JD", is_guest: false }],
      })
      const res = await rosterGET(new Request("http://localhost/api/admin/checkin?eventId=e1"))
      expect(res.status).toBe(200)
      const { roster } = await res.json()
      expect(roster).toHaveLength(1)
      expect(roster[0]).toMatchObject({
        attendanceId: "a1",
        name: "Juan DelaCruz",
        status: "registered",
        category: "youth",
        hasGuardian: true,
      })
    }
  })

  it("400s without an eventId", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({})
    const res = await rosterGET(new Request("http://localhost/api/admin/checkin"))
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/admin/checkin (undo an attendance mark)", () => {
  const unmarkReq = (id: string) =>
    new Request(`http://localhost/api/admin/checkin?attendanceId=${id}`, { method: "DELETE" })

  const attended = { id: "a1", member_id: "m1", event_id: "e1", status: "attended" }

  it("403s without a session", async () => {
    vi.mocked(readSession).mockReturnValue(null)
    use({ attendanceRow: attended })
    expect((await unmarkDELETE(unmarkReq("a1"))).status).toBe(403)
  })

  // The same role as marking, deliberately: the person who needs to fix a
  // mis-tap is the core leader who made it, mid-queue at the door.
  it("is allowed for core as well as admin", async () => {
    for (const session of [ADMIN, CORE]) {
      vi.mocked(readSession).mockReturnValue(session)
      use({ attendanceRow: attended })
      expect((await unmarkDELETE(unmarkReq("a1"))).status).toBe(200)
    }
  })

  it("400s without an attendance id", async () => {
    vi.mocked(readSession).mockReturnValue(CORE)
    use({ attendanceRow: attended })
    const res = await unmarkDELETE(
      new Request("http://localhost/api/admin/checkin", { method: "DELETE" }),
    )
    expect(res.status).toBe(400)
  })

  it("404s for a record that is gone", async () => {
    vi.mocked(readSession).mockReturnValue(CORE)
    use({ attendanceRow: null })
    expect((await unmarkDELETE(unmarkReq("nope"))).status).toBe(404)
  })

  it("writes ONLY status and attended_at, on that one row", async () => {
    let payload: Record<string, unknown> | undefined
    let filters: Record<string, string> | undefined
    vi.mocked(readSession).mockReturnValue(CORE)
    use({
      attendanceRow: attended,
      onUpdate: (p, f) => {
        payload = p
        filters = f
      },
    })

    const res = await unmarkDELETE(unmarkReq("a1"))
    expect(res.status).toBe(200)
    expect(payload).toEqual({ status: "registered", attended_at: null })
    // Scoped to the row AND to its current state, so two leaders undoing at
    // once cannot double-apply.
    expect(filters?.id).toBe("a1")
    expect(filters?.status).toBe("attended")
  })

  it("is idempotent — undoing an already pre-registered row writes nothing", async () => {
    let wrote = false
    vi.mocked(readSession).mockReturnValue(CORE)
    use({
      attendanceRow: { ...attended, status: "registered" },
      onUpdate: () => {
        wrote = true
      },
    })

    const res = await unmarkDELETE(unmarkReq("a1"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, alreadyRegistered: true })
    expect(wrote).toBe(false)
  })

  it("never touches the registration itself", async () => {
    // No cascade, no photo removal, no member write — undoing attendance is a
    // status correction, not a cancellation.
    let payload: Record<string, unknown> | undefined
    vi.mocked(readSession).mockReturnValue(CORE)
    use({ attendanceRow: attended, onUpdate: (p) => { payload = p } })
    await unmarkDELETE(unmarkReq("a1"))

    for (const untouched of ["category", "is_core", "baby_photo_url", "guardian_name", "member_id", "event_id"]) {
      expect(payload).not.toHaveProperty(untouched)
    }
  })

  it("500s rather than reporting success when the write fails", async () => {
    vi.mocked(readSession).mockReturnValue(CORE)
    use({ attendanceRow: attended, updateError: { message: "boom" } })
    expect((await unmarkDELETE(unmarkReq("a1"))).status).toBe(500)
  })
})

describe("GET /api/admin/checkin — baby photos on the day-of roster", () => {
  beforeEach(() => vi.mocked(readSession).mockReturnValue(CORE))

  const roster = (photo: string | null) => ({
    rosterRows: [
      {
        id: "a1", member_id: "m1", status: "registered",
        checked_in_at: "2026-08-15T02:30:00Z", attended_at: null,
        category: "ya", is_core: false, baby_photo_url: photo,
        guardian_name: null, guardian_contact: null,
      },
    ],
    memberRows: [{ id: "m1", first_name: "Juan", last_name: "Dela Cruz", nickname: null, is_guest: false }],
  })

  async function rosterOf(): Promise<Record<string, unknown>[]> {
    const res = await rosterGET(new Request("http://localhost/api/admin/checkin?eventId=e1"))
    return (await res.json()).roster
  }

  it("signs a real stored photo for the leader's screen", async () => {
    let signed: string[] = []
    use({ ...roster("baby-1786166356633-abc.jpeg"), onSign: (p) => { signed = p } })
    const [row] = await rosterOf()
    expect(signed).toEqual(["baby-1786166356633-abc.jpeg"])
    expect(row.babyPhotoUrl).toBe("https://signed.test/baby-1786166356633-abc.jpeg?token=abc")
  })

  // baby_photo_url is written from a PUBLIC form. A value that is not one of
  // our bucket objects is not turned into an <img src> on a signed-in leader's
  // phone, whatever it is.
  it("renders nothing for a value that is not one of our stored objects", async () => {
    for (const hostile of ["https://tracker.test/pixel.gif", "../../other/secret.jpg", "nested/x.jpg"]) {
      let signed: string[] | null = null
      use({ ...roster(hostile), onSign: (p) => { signed = p } })
      const [row] = await rosterOf()
      expect(row.babyPhotoUrl).toBeNull()
      // Nothing was even asked of storage.
      expect(signed).toBeNull()
    }
  })

  it("renders nothing when the registrant has no photo", async () => {
    use(roster(null))
    expect((await rosterOf())[0].babyPhotoUrl).toBeNull()
  })
})

describe("POST /api/admin/checkin (mark attended)", () => {
  it("403s without a session", async () => {
    vi.mocked(readSession).mockReturnValue(null)
    const res = await markPOST(markReq({ attendanceId: "a1" }))
    expect(res.status).toBe(403)
  })

  it("flips a registered row to attended, stamps attended_at, and updates ONLY that row (id+status filters)", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    let payload: Record<string, unknown> | undefined
    let filters: Record<string, string> | undefined
    use({
      attendanceRow: { id: "a1", member_id: "m1", event_id: "e1", status: "registered" },
      memberRow: { first_name: "Juan", last_name: "DelaCruz", email: "j@x.test" },
      onUpdate: (p, f) => { payload = p; filters = f },
    })
    const res = await markPOST(markReq({ attendanceId: "a1" }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    // Update touches only status + attended_at…
    expect(Object.keys(payload!).sort()).toEqual(["attended_at", "status"])
    expect(payload!.status).toBe("attended")
    expect(payload!.attended_at).toBeTruthy()
    // …and is scoped to exactly this row while it is still 'registered'.
    expect(filters).toMatchObject({ id: "a1", status: "registered" })
    expect(pushAttendanceToSheets).toHaveBeenCalledTimes(1)
  })

  it("is idempotent: an already-attended row is a no-op success with no update and no sheets push", async () => {
    vi.mocked(readSession).mockReturnValue(CORE)
    let updated = false
    use({
      attendanceRow: { id: "a1", member_id: "m1", event_id: "e1", status: "attended" },
      onUpdate: () => { updated = true },
    })
    const res = await markPOST(markReq({ attendanceId: "a1" }))
    expect(res.status).toBe(200)
    expect((await res.json()).alreadyAttended).toBe(true)
    expect(updated).toBe(false)
    expect(pushAttendanceToSheets).not.toHaveBeenCalled()
  })

  it("404s for an unknown attendance id", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({ attendanceRow: null })
    const res = await markPOST(markReq({ attendanceId: "nope" }))
    expect(res.status).toBe(404)
  })

  it("400s without an attendanceId", async () => {
    vi.mocked(readSession).mockReturnValue(ADMIN)
    use({})
    const res = await markPOST(markReq({}))
    expect(res.status).toBe(400)
  })
})
