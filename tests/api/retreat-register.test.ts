import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the service-role client and the Google Sheets lib — no DB / network / prod.
vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))
vi.mock("@/lib/google-sheets", () => ({
  syncMemberToSheet: vi.fn(async () => {}),
  syncAttendanceToSheet: vi.fn(async () => {}),
}))

import { createRouteHandlerClient } from "@/lib/supabase-server"
import { syncMemberToSheet, syncAttendanceToSheet } from "@/lib/google-sheets"
import { POST as retreatPOST } from "@/app/api/attend/retreat-register/route"
import { __resetRateLimit } from "@/lib/rate-limit"

interface ClientCfg {
  rpc?: { data: unknown; error: unknown }
  select?: Record<string, { data: unknown; error?: unknown }>
  insert?: Record<string, { error: unknown }>
  onRpc?: (fn: string, args: Record<string, unknown>) => void
  onInsert?: (table: string, payload: Record<string, unknown>) => void
}

function makeClient(cfg: ClientCfg) {
  return {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      cfg.onRpc?.(fn, args)
      return cfg.rpc ?? { data: null, error: null }
    }),
    from: (table: string) => {
      const qb: Record<string, unknown> = {}
      Object.assign(qb, {
        select: () => qb,
        eq: () => qb,
        maybeSingle: async () => cfg.select?.[table] ?? { data: null, error: null },
        insert: async (payload: Record<string, unknown>) => {
          cfg.onInsert?.(table, payload)
          return cfg.insert?.[table] ?? { error: null }
        },
      })
      return qb
    },
  }
}

function use(cfg: ClientCfg) {
  vi.mocked(createRouteHandlerClient).mockReturnValue(makeClient(cfg) as never)
}

let ipCounter = 0
function req(body: unknown, ip?: string) {
  return new Request("http://localhost/api/attend/retreat-register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Unique IP per request by default so the limiter never couples tests.
      "x-forwarded-for": ip ?? `10.0.0.${++ipCounter}`,
    },
    body: JSON.stringify(body),
  })
}

/** Birthdate string for someone exactly `years` old today (plus a margin day). */
function birthdateForAge(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

const okMember = { id: "m1", first_name: "Juan", last_name: "DelaCruz", email: "juan@x.test" }

beforeEach(() => {
  vi.clearAllMocks()
  __resetRateLimit()
})

describe("POST /api/attend/retreat-register — new person", () => {
  const validBody = () => ({
    eventId: "e1",
    email: "juan@x.test",
    privacyConsent: true,
    member: { first_name: "Juan", last_name: "DelaCruz", birthdate: birthdateForAge(16) },
    retreat: {
      category: "youth",
      guardian_name: "Maria DelaCruz",
      guardian_contact: "0917 000 1111",
    },
  })

  it("pre-registers with status='registered' and passes retreat meta to the RPC", async () => {
    let rpcArgs: Record<string, unknown> | undefined
    use({ rpc: { data: okMember, error: null }, onRpc: (_fn, args) => { rpcArgs = args } })
    const res = await retreatPOST(req(validBody()))
    expect(res.status).toBe(200)
    expect(rpcArgs!.p_status).toBe("registered")
    const meta = rpcArgs!.p_retreat as Record<string, unknown>
    expect(meta.category).toBe("youth")
    expect(meta.guardian_name).toBe("Maria DelaCruz")
  })

  it("syncs the member to Sheets but NOT an attendance line (pre-reg is not attendance)", async () => {
    use({ rpc: { data: okMember, error: null } })
    await retreatPOST(req(validBody()))
    expect(syncMemberToSheet).toHaveBeenCalledTimes(1)
    expect(syncAttendanceToSheet).not.toHaveBeenCalled()
  })

  it("rejects a missing birthday (400)", async () => {
    use({})
    const body = validBody()
    delete (body.member as Record<string, unknown>).birthdate
    const res = await retreatPOST(req(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/birthday/i)
  })

  it("rejects under-12 registrants (400)", async () => {
    use({})
    const body = validBody()
    body.member.birthdate = birthdateForAge(9)
    const res = await retreatPOST(req(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ages 12 and up/i)
  })

  it("requires a baby photo for category 'ya' (400)", async () => {
    use({})
    const body = validBody()
    body.member.birthdate = birthdateForAge(25)
    body.retreat = { category: "ya" } as never
    const res = await retreatPOST(req(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/baby/i)
  })

  it("accepts YA with a baby photo URL", async () => {
    use({ rpc: { data: okMember, error: null } })
    const body = validBody()
    body.member.birthdate = birthdateForAge(25)
    body.retreat = { category: "ya", baby_photo_url: "https://x.test/baby.jpg" } as never
    const res = await retreatPOST(req(body))
    expect(res.status).toBe(200)
  })

  it("requires guardian name + contact for minors (400)", async () => {
    use({})
    const body = validBody()
    body.retreat = { category: "youth" } as never // 16yo, no guardian
    const res = await retreatPOST(req(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/guardian/i)
  })

  it("does not require guardian fields for adults", async () => {
    use({ rpc: { data: okMember, error: null } })
    const body = validBody()
    body.member.birthdate = birthdateForAge(19)
    body.retreat = { category: "youth" } as never
    const res = await retreatPOST(req(body))
    expect(res.status).toBe(200)
  })

  it("rejects missing privacy consent (400)", async () => {
    use({})
    const body = { ...validBody(), privacyConsent: false }
    const res = await retreatPOST(req(body))
    expect(res.status).toBe(400)
  })

  it("maps a duplicate email to 409", async () => {
    use({ rpc: { data: null, error: { code: "23505", message: "dup" } } })
    const res = await retreatPOST(req(validBody()))
    expect(res.status).toBe(409)
  })
})

describe("POST /api/attend/retreat-register — existing member", () => {
  const validBody = () => ({
    eventId: "e1",
    memberId: "m1",
    retreat: {
      birthdate: birthdateForAge(24),
      category: "ya",
      baby_photo_url: "https://x.test/baby.jpg",
    },
  })

  it("inserts an attendance row with status='registered' and never touches the member row", async () => {
    let insertTable: string | undefined
    let insertPayload: Record<string, unknown> | undefined
    use({
      select: { members: { data: { id: "m1", first_name: "Juan" } } },
      onInsert: (table, payload) => { insertTable = table; insertPayload = payload },
    })
    const res = await retreatPOST(req(validBody()))
    expect(res.status).toBe(200)
    expect(insertTable).toBe("attendance")
    expect(insertPayload!.status).toBe("registered")
    expect(insertPayload!.category).toBe("ya")
  })

  it("maps an existing attendance row to 409 (already registered)", async () => {
    use({
      select: { members: { data: { id: "m1", first_name: "Juan" } } },
      insert: { attendance: { error: { code: "23505", message: "dup" } } },
    })
    const res = await retreatPOST(req(validBody()))
    expect(res.status).toBe(409)
  })

  it("404s for an unknown memberId", async () => {
    use({ select: { members: { data: null } } })
    const res = await retreatPOST(req(validBody()))
    expect(res.status).toBe(404)
  })

  it("applies the same retreat validation (minor without guardian -> 400)", async () => {
    use({ select: { members: { data: { id: "m1", first_name: "Juan" } } } })
    const body = validBody()
    body.retreat = { birthdate: birthdateForAge(13), category: "youth" } as never
    const res = await retreatPOST(req(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/guardian/i)
  })
})

describe("POST /api/attend/retreat-register — rate limiting", () => {
  it("returns 429 after 10 requests from the same IP within a minute", async () => {
    use({})
    const ip = "10.9.9.9"
    for (let i = 0; i < 10; i++) {
      await retreatPOST(req({ eventId: "" }, ip)) // 400s, but they count
    }
    const res = await retreatPOST(req({ eventId: "" }, ip))
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
  })
})
