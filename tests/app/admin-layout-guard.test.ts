import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The admin guard now lives in a Node-runtime server layout (not Edge
// middleware), so it can use the Node-crypto session verify safely. These tests
// cover the extracted guard helper + that the layout actually wires it.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error("NEXT_REDIRECT:" + url)
  }),
}))
vi.mock("@/lib/admin-session", () => ({ readSession: vi.fn() }))

import { requireAdminPage } from "@/lib/admin-auth"
import { readSession } from "@/lib/admin-session"
import { redirect } from "next/navigation"

const mockedReadSession = vi.mocked(readSession)
const SESSION = { memberId: "x", email: "a@b.c", role: "core" as const, iat: 0 }

beforeEach(() => vi.clearAllMocks())

describe("requireAdminPage() — Node-runtime admin guard", () => {
  it("redirects to /admin/login when there is no session", () => {
    mockedReadSession.mockReturnValue(null)
    try {
      requireAdminPage()
    } catch {
      /* redirect() throws by design */
    }
    expect(redirect).toHaveBeenCalledWith("/admin/login")
  })

  it("returns the session (no redirect) when one exists", () => {
    mockedReadSession.mockReturnValue(SESSION)
    const s = requireAdminPage()
    expect(redirect).not.toHaveBeenCalled()
    expect(s).toEqual(SESSION)
  })
})

describe("the admin (dashboard) layout wires the guard", () => {
  it("calls requireAdminPage()", () => {
    const src = readFileSync(join(process.cwd(), "app/admin/(dashboard)/layout.tsx"), "utf8")
    expect(src).toMatch(/requireAdminPage\s*\(/)
  })
})
