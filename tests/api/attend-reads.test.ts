import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))
vi.mock("@/lib/google-sheets", () => ({ syncMemberToSheet: vi.fn(async () => {}) }))

import { createRouteHandlerClient } from "@/lib/supabase-server"
import { __resetRateLimit } from "@/lib/rate-limit"
import { POST as lookupPOST } from "@/app/api/attend/lookup/route"
import { POST as profileGET, PUT as profilePUT } from "@/app/api/attend/profile/route"
import { POST as changePinPOST } from "@/app/api/attend/change-pin/route"

interface ClientCfg {
  rpc?: { data: unknown; error: unknown }
  maybeSingle?: Record<string, { data: unknown; error?: unknown }>
  single?: Record<string, { data: unknown; error?: unknown }>
  await?: Record<string, { data?: unknown; error: unknown }>
  onUpdate?: (table: string, obj: Record<string, unknown>) => void
}

function makeClient(cfg: ClientCfg) {
  return {
    rpc: vi.fn(async () => cfg.rpc ?? { data: null, error: null }),
    from: (table: string) => {
      const pick = (kind: keyof ClientCfg) =>
        (cfg[kind] as Record<string, unknown> | undefined)?.[table] ?? { data: null, error: null }
      const qb: Record<string, unknown> = {}
      Object.assign(qb, {
        select: () => qb,
        eq: () => qb,
        update: (obj: Record<string, unknown>) => { cfg.onUpdate?.(table, obj); return qb },
        maybeSingle: async () => pick("maybeSingle"),
        single: async () => pick("single"),
        then: (resolve: (v: unknown) => void) => resolve(pick("await")),
      })
      return qb
    },
  }
}

function use(cfg: ClientCfg) {
  vi.mocked(createRouteHandlerClient).mockReturnValue(makeClient(cfg) as never)
}

function req(body: unknown, ip = "10.0.0.1") {
  return new Request("http://localhost/api/attend/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetRateLimit()
})

describe("POST /api/attend/lookup", () => {
  const summary = { id: "m1", first_name: "Juan", last_name: "X", photo_url: null, is_guest: false }

  it("returns minimal member + alreadyCheckedIn=false when found and not checked in", async () => {
    use({ maybeSingle: { members: { data: summary }, attendance: { data: null } } })
    const res = await lookupPOST(req({ email: "juan@x.test", eventId: "e1" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.found).toBe(true)
    expect(json.member).toEqual(summary)
    expect(json.alreadyCheckedIn).toBe(false)
    // Must NOT leak PII columns.
    expect(Object.keys(json.member).sort()).toEqual(["first_name", "id", "is_guest", "last_name", "photo_url"])
  })

  it("flags alreadyCheckedIn when an attendance row exists", async () => {
    use({ maybeSingle: { members: { data: summary }, attendance: { data: { id: "a1" } } } })
    const res = await lookupPOST(req({ email: "juan@x.test", eventId: "e1" }))
    expect((await res.json()).alreadyCheckedIn).toBe(true)
  })

  it("returns found=false for an unknown email (no enumeration of details)", async () => {
    use({ maybeSingle: { members: { data: null } } })
    const res = await lookupPOST(req({ email: "ghost@x.test", eventId: "e1" }))
    expect((await res.json()).found).toBe(false)
  })

  it("rejects a missing email (400)", async () => {
    use({})
    const res = await lookupPOST(req({ eventId: "e1" }))
    expect(res.status).toBe(400)
  })

  it("throttles repeated lookups from one IP (429)", async () => {
    use({ maybeSingle: { members: { data: null } } })
    let last = 200
    for (let i = 0; i < 21; i++) {
      last = (await lookupPOST(req({ email: `x${i}@y.test` }, "9.9.9.9"))).status
    }
    expect(last).toBe(429)
  })
})

describe("POST /api/attend/profile (fetch behind PIN)", () => {
  const full = { id: "m1", first_name: "Juan", email: "juan@x.test", address: "secret" }

  it("returns the full record when the PIN is correct", async () => {
    use({ rpc: { data: true, error: null }, maybeSingle: { members: { data: full } } })
    const res = await profileGET(req({ memberId: "m1", pin: "1234" }))
    expect(res.status).toBe(200)
    expect((await res.json()).member).toEqual(full)
  })

  it("returns 401 for a wrong PIN", async () => {
    use({ rpc: { data: false, error: null } })
    const res = await profileGET(req({ memberId: "m1", pin: "0000" }))
    expect(res.status).toBe(401)
  })

  it("rejects a missing PIN (400)", async () => {
    use({})
    const res = await profileGET(req({ memberId: "m1" }))
    expect(res.status).toBe(400)
  })

  it("locks out after repeated wrong PINs from one IP (429)", async () => {
    use({ rpc: { data: false, error: null } })
    let last = 401
    for (let i = 0; i < 9; i++) {
      last = (await profileGET(req({ memberId: "victim", pin: "0000" }, "8.8.8.8"))).status
    }
    expect(last).toBe(429)
  })
})

describe("PUT /api/attend/profile (save behind PIN)", () => {
  const updated = { id: "m1", first_name: "New", email: "juan@x.test" }

  it("saves whitelisted fields and STRIPS privilege flags", async () => {
    let captured: Record<string, unknown> | undefined
    use({ rpc: { data: true, error: null }, single: { members: { data: updated } }, onUpdate: (_t, obj) => { captured = obj } })
    const res = await profilePUT(req({ memberId: "m1", pin: "1234", member: { first_name: "New", is_admin: true, is_youth_ya_core: true, email: "hacker@x.test" } }))
    expect(res.status).toBe(200)
    expect(captured!.first_name).toBe("New")
    expect(captured!.is_admin).toBeUndefined()
    expect(captured!.is_youth_ya_core).toBeUndefined()
    expect(captured!.email).toBeUndefined() // email is not editable
    expect(captured!.updated_at).toBeDefined()
  })

  it("returns 401 for a wrong PIN", async () => {
    use({ rpc: { data: false, error: null } })
    const res = await profilePUT(req({ memberId: "m1", pin: "0000", member: { first_name: "New" } }))
    expect(res.status).toBe(401)
  })
})

describe("POST /api/attend/change-pin", () => {
  it("changes the PIN when the current PIN is correct", async () => {
    use({ rpc: { data: true, error: null }, await: { members: { error: null } } })
    const res = await changePinPOST(req({ memberId: "m1", currentPin: "1234", newPin: "5678" }))
    expect(res.status).toBe(200)
  })

  it("returns 401 when the current PIN is wrong", async () => {
    use({ rpc: { data: false, error: null } })
    const res = await changePinPOST(req({ memberId: "m1", currentPin: "0000", newPin: "5678" }))
    expect(res.status).toBe(401)
  })

  it("rejects a non-4-digit new PIN (400)", async () => {
    use({ rpc: { data: true, error: null } })
    const res = await changePinPOST(req({ memberId: "m1", currentPin: "1234", newPin: "12" }))
    expect(res.status).toBe(400)
  })
})
