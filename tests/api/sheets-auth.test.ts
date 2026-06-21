import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Batch 0 — proof-of-hole for the unauthenticated /api/sheets/* routes.
 *
 * These are route-handler unit tests: all IO (Supabase service-role client,
 * Google Sheets helper, googleapis) is mocked, so NOTHING touches a real
 * database, Google account, or production. They assert the SECURE end state
 * (anonymous POST must be rejected with 403). Against the CURRENT code the
 * routes have no auth gate, so the "anonymous -> 403" tests fail RED, which
 * is the proof the holes are real. Batch 1 adds readSession()+role gating to
 * make them GREEN.
 */

// Controls "who is logged in". The current routes ignore this; Batch 1 will use it.
vi.mock("@/lib/admin-session", () => ({
  readSession: vi.fn(),
  SESSION_COOKIE: "ctj_admin",
}))

// Fake Supabase service-role client — never hits a real DB.
vi.mock("@/lib/supabase-server", () => {
  function makeQb() {
    const qb: Record<string, unknown> = {}
    const chain = () => qb
    Object.assign(qb, {
      select: chain,
      order: chain,
      eq: chain,
      in: chain,
      gte: chain,
      limit: chain,
      single: async () => ({
        data: { id: "x", first_name: "A", last_name: "B", email: "a@b.c", name: "Event" },
        error: null,
      }),
      // Thenable: awaiting the builder resolves to an empty result set.
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    })
    return qb
  }
  return {
    createRouteHandlerClient: vi.fn(() => ({ from: () => makeQb() })),
  }
})

// Fake Google Sheets helper lib.
vi.mock("@/lib/google-sheets", () => ({
  exportAllToSheet: vi.fn(async () => ({ members: 0, attendance: 0 })),
  syncMemberToSheet: vi.fn(async () => {}),
  syncAttendanceToSheet: vi.fn(async () => {}),
}))

// Fake googleapis (used directly by the init route).
vi.mock("googleapis", () => {
  const spreadsheets = {
    create: vi.fn(async () => ({ data: { spreadsheetId: "sheet_123" } })),
    values: { update: vi.fn(async () => ({})) },
  }
  const permissions = { create: vi.fn(async () => ({})) }
  return {
    google: {
      auth: { GoogleAuth: class {} },
      sheets: vi.fn(() => ({ spreadsheets })),
      drive: vi.fn(() => ({ permissions })),
    },
  }
})

import { readSession } from "@/lib/admin-session"
import { POST as exportPOST } from "@/app/api/sheets/export/route"
import { POST as syncPOST } from "@/app/api/sheets/sync/route"
import { POST as initPOST } from "@/app/api/sheets/init/route"
import { POST as importBubblePOST } from "@/app/api/sheets/import-bubble/route"

const mockedReadSession = vi.mocked(readSession)
const ADMIN_SESSION = { memberId: "m1", email: "admin@ctj.test", role: "admin" as const, iat: 0 }

function jsonReq(body?: unknown) {
  return new Request("http://localhost/api/sheets/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("/api/sheets/export auth gate", () => {
  it("rejects an anonymous (no session) POST with 403", async () => {
    mockedReadSession.mockReturnValue(null)
    const res = await exportPOST()
    expect(res.status).toBe(403)
  })

  it("allows an authenticated admin POST", async () => {
    mockedReadSession.mockReturnValue(ADMIN_SESSION)
    const res = await exportPOST()
    expect(res.status).toBe(200)
  })
})

describe("/api/sheets/sync auth gate", () => {
  it("rejects an anonymous (no session) POST with 403", async () => {
    mockedReadSession.mockReturnValue(null)
    const res = await syncPOST(jsonReq({ type: "member", data: { memberId: "m1" } }))
    expect(res.status).toBe(403)
  })

  it("allows an authenticated admin POST", async () => {
    mockedReadSession.mockReturnValue(ADMIN_SESSION)
    const res = await syncPOST(jsonReq({ type: "member", data: { memberId: "m1" } }))
    expect(res.status).toBe(200)
  })
})

describe("/api/sheets/init auth gate", () => {
  it("rejects an anonymous (no session) POST with 403", async () => {
    mockedReadSession.mockReturnValue(null)
    const res = await initPOST()
    expect(res.status).toBe(403)
  })

  it("allows an authenticated admin POST", async () => {
    mockedReadSession.mockReturnValue(ADMIN_SESSION)
    const res = await initPOST()
    expect(res.status).toBe(200)
  })
})

describe("/api/sheets/import-bubble auth gate", () => {
  it("rejects an anonymous (no session) POST with 403 before parsing any upload", async () => {
    mockedReadSession.mockReturnValue(null)
    const res = await importBubblePOST(jsonReq())
    expect(res.status).toBe(403)
  })
})
