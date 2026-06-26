import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the service-role client and the Google Sheets lib — no DB / network / prod.
vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))
vi.mock("@/lib/google-sheets", () => ({
  syncMemberToSheet: vi.fn(async () => {}),
  syncAttendanceToSheet: vi.fn(async () => {}),
}))

import { createRouteHandlerClient } from "@/lib/supabase-server"
import { syncAttendanceToSheet } from "@/lib/google-sheets"
import { POST as registerPOST } from "@/app/api/attend/register/route"
import { POST as guestPOST } from "@/app/api/attend/guest/route"
import { POST as checkinPOST } from "@/app/api/attend/check-in/route"

interface ClientCfg {
  rpc?: { data: unknown; error: unknown }
  select?: Record<string, { data: unknown; error?: unknown }>
  insert?: Record<string, { error: unknown }>
  onRpc?: (fn: string, args: Record<string, unknown>) => void
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
        insert: async () => cfg.insert?.[table] ?? { error: null },
      })
      return qb
    },
  }
}

function use(cfg: ClientCfg) {
  vi.mocked(createRouteHandlerClient).mockReturnValue(makeClient(cfg) as never)
}

function req(body: unknown) {
  return new Request("http://localhost/api/attend/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe("POST /api/attend/register", () => {
  const okMember = { id: "m1", first_name: "Juan", last_name: "DelaCruz", email: "juan@x.test" }

  it("registers a new member, checks them in, and syncs to Sheets", async () => {
    use({ rpc: { data: okMember, error: null }, select: { events: { data: { name: "Fellowship" } } } })
    const res = await registerPOST(req({ eventId: "e1", email: "juan@x.test", privacyConsent: true, member: { first_name: "Juan", last_name: "DelaCruz" } }))
    expect(res.status).toBe(200)
    expect((await res.json()).firstName).toBe("Juan")
    expect(syncAttendanceToSheet).toHaveBeenCalledTimes(1)
  })

  it("strips privilege flags before calling the RPC", async () => {
    let seen: Record<string, unknown> | undefined
    use({
      rpc: { data: okMember, error: null },
      select: { events: { data: { name: "Fellowship" } } },
      onRpc: (_fn, args) => { seen = args.p_member as Record<string, unknown> },
    })
    await registerPOST(req({ eventId: "e1", email: "juan@x.test", privacyConsent: true, member: { first_name: "Juan", last_name: "DelaCruz", is_admin: true, is_youth_ya_core: true } }))
    expect(seen).toBeDefined()
    expect(seen!.is_admin).toBeUndefined()
    expect(seen!.is_youth_ya_core).toBeUndefined()
  })

  it("rejects when privacy consent is missing (400)", async () => {
    use({ rpc: { data: okMember, error: null } })
    const res = await registerPOST(req({ eventId: "e1", email: "juan@x.test", member: { first_name: "Juan", last_name: "DelaCruz" } }))
    expect(res.status).toBe(400)
  })

  it("rejects an invalid email (400)", async () => {
    use({ rpc: { data: okMember, error: null } })
    const res = await registerPOST(req({ eventId: "e1", email: "nope", privacyConsent: true, member: { first_name: "Juan", last_name: "DelaCruz" } }))
    expect(res.status).toBe(400)
  })

  it("returns 409 on duplicate email", async () => {
    use({ rpc: { data: null, error: { code: "23505" } } })
    const res = await registerPOST(req({ eventId: "e1", email: "dup@x.test", privacyConsent: true, member: { first_name: "A", last_name: "B" } }))
    expect(res.status).toBe(409)
  })
})

describe("POST /api/attend/guest", () => {
  it("checks in a guest and syncs", async () => {
    use({ rpc: { data: { id: "g1", first_name: "Mark", last_name: "G", email: "guest@guest.local" }, error: null }, select: { events: { data: { name: "Fellowship" } } } })
    const res = await guestPOST(req({ eventId: "e1", firstName: "Mark", lastName: "G", privacyConsent: true }))
    expect(res.status).toBe(200)
    expect((await res.json()).firstName).toBe("Mark")
    expect(syncAttendanceToSheet).toHaveBeenCalledTimes(1)
  })

  it("rejects guest without consent (400)", async () => {
    use({})
    const res = await guestPOST(req({ eventId: "e1", firstName: "Mark", lastName: "G" }))
    expect(res.status).toBe(400)
  })
})

describe("POST /api/attend/check-in", () => {
  const member = { id: "m1", first_name: "Juan", last_name: "X", email: "juan@x.test" }

  it("records attendance for an existing member and syncs", async () => {
    use({ select: { members: { data: member }, events: { data: { name: "Fellowship" } } }, insert: { attendance: { error: null } } })
    const res = await checkinPOST(req({ eventId: "e1", memberId: "m1" }))
    expect(res.status).toBe(200)
    expect(syncAttendanceToSheet).toHaveBeenCalledTimes(1)
  })

  it("treats a repeat check-in (23505) as success", async () => {
    use({ select: { members: { data: member } }, insert: { attendance: { error: { code: "23505" } } } })
    const res = await checkinPOST(req({ eventId: "e1", memberId: "m1" }))
    expect(res.status).toBe(200)
    expect((await res.json()).alreadyCheckedIn).toBe(true)
  })

  it("returns 404 for an unknown member", async () => {
    use({ select: { members: { data: null } } })
    const res = await checkinPOST(req({ eventId: "e1", memberId: "ghost" }))
    expect(res.status).toBe(404)
  })

  it("rejects missing fields (400)", async () => {
    use({})
    const res = await checkinPOST(req({ eventId: "e1" }))
    expect(res.status).toBe(400)
  })
})
