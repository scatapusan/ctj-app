import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/admin-session", () => ({ readSession: vi.fn() }))
vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))

import { readSession } from "@/lib/admin-session"
import { createRouteHandlerClient } from "@/lib/supabase-server"
import { GET as dashboardGET } from "@/app/api/admin/dashboard/route"
import { GET as membersGET } from "@/app/api/admin/members/route"
import { GET as memberGET, PATCH as memberPATCH, DELETE as memberDELETE } from "@/app/api/admin/members/[id]/route"
import { POST as eventCreate } from "@/app/api/admin/events/route"
import { PATCH as eventPATCH, DELETE as eventDELETE } from "@/app/api/admin/events/[id]/route"

const ADMIN = { memberId: "x", email: "a@ctj.test", role: "admin" as const, iat: 0 }
const CORE = { memberId: "y", email: "c@ctj.test", role: "core" as const, iat: 0 }

// Lenient fake client so every route reaches its success path; we are testing
// the auth/role gate, not the data logic.
function makeClient() {
  const qb: Record<string, unknown> = {}
  Object.assign(qb, {
    select: () => qb,
    eq: () => qb,
    in: () => qb,
    gte: () => qb,
    order: () => qb,
    limit: () => qb,
    update: () => qb,
    delete: () => qb,
    insert: () => qb,
    maybeSingle: async () => ({ data: { id: "x", photo_url: null, first_name: "A", last_name: "B" }, error: null }),
    single: async () => ({ data: { id: "e1", name: "Ev" }, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null }),
  })
  return {
    from: () => qb,
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({ remove: async () => ({}) }) },
  }
}

const params = (id: string) => ({ params: { id } })
function req(body?: unknown, url = "http://localhost/api/admin/x") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createRouteHandlerClient).mockReturnValue(makeClient() as never)
})

function as(session: typeof ADMIN | typeof CORE | null) {
  vi.mocked(readSession).mockReturnValue(session)
}

describe("admin read routes — admin OR core, 403 without session", () => {
  it("dashboard: 403 without session", async () => { as(null); expect((await dashboardGET()).status).toBe(403) })
  it("dashboard: 200 for core", async () => { as(CORE); expect((await dashboardGET()).status).toBe(200) })
  it("dashboard: 200 for admin", async () => { as(ADMIN); expect((await dashboardGET()).status).toBe(200) })
  it("members list: 403 without session", async () => { as(null); expect((await membersGET()).status).toBe(403) })
  it("members list: 200 for core", async () => { as(CORE); expect((await membersGET()).status).toBe(200) })
  it("member detail: 200 for core", async () => { as(CORE); expect((await memberGET(req(), params("m1"))).status).toBe(200) })
})

describe("member mutations — per-action role rules", () => {
  it("setGroup: allowed for core (admin OR core)", async () => {
    as(CORE)
    const res = await memberPATCH(req({ action: "setGroup", group: "Youth" }), params("m1"))
    expect(res.status).toBe(200)
  })
  it("toggleAdmin: FORBIDDEN for core (admin only)", async () => {
    as(CORE)
    const res = await memberPATCH(req({ action: "toggleAdmin", value: true }), params("m1"))
    expect(res.status).toBe(403)
  })
  it("toggleAdmin: allowed for admin", async () => {
    as(ADMIN)
    const res = await memberPATCH(req({ action: "toggleAdmin", value: true }), params("m1"))
    expect(res.status).toBe(200)
  })
  it("resetPin: FORBIDDEN for core", async () => {
    as(CORE)
    expect((await memberPATCH(req({ action: "resetPin" }), params("m1"))).status).toBe(403)
  })
  it("unknown action: 400 for admin", async () => {
    as(ADMIN)
    expect((await memberPATCH(req({ action: "nope" }), params("m1"))).status).toBe(400)
  })
  it("PATCH: 403 without session", async () => {
    as(null)
    expect((await memberPATCH(req({ action: "setGroup", group: "Youth" }), params("m1"))).status).toBe(403)
  })
})

describe("member delete — admin only", () => {
  it("FORBIDDEN for core", async () => { as(CORE); expect((await memberDELETE(req(), params("m1"))).status).toBe(403) })
  it("allowed for admin", async () => { as(ADMIN); expect((await memberDELETE(req(), params("m1"))).status).toBe(200) })
})

describe("event writes — admin only", () => {
  it("create: FORBIDDEN for core", async () => {
    as(CORE)
    expect((await eventCreate(req({ name: "E", event_date: "2026-06-21" }))).status).toBe(403)
  })
  it("create: allowed for admin", async () => {
    as(ADMIN)
    expect((await eventCreate(req({ name: "E", event_date: "2026-06-21" }))).status).toBe(200)
  })
  it("edit: FORBIDDEN for core", async () => {
    as(CORE)
    expect((await eventPATCH(req({ name: "E2" }), params("e1"))).status).toBe(403)
  })
  it("edit: allowed for admin", async () => {
    as(ADMIN)
    expect((await eventPATCH(req({ name: "E2" }), params("e1"))).status).toBe(200)
  })
  it("delete: allowed for admin, forbidden for core", async () => {
    as(CORE)
    expect((await eventDELETE(req(), params("e1"))).status).toBe(403)
    as(ADMIN)
    expect((await eventDELETE(req(), params("e1"))).status).toBe(200)
  })
})
