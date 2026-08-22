// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import MembersPage from "@/app/admin/(dashboard)/members/page"
import { RoleProvider } from "@/components/admin/role-provider"

const mk = (id: string, first: string, last: string) => ({
  id, email: `${first}@x.test`, first_name: first, middle_name: null, last_name: last,
  birthdate: "2000-01-01", contact_number: "0917", facebook_link: null, address: "addr",
  photo_url: null, discipler_name: null, disciples: null, prospect_disciples: null,
  lifeline_leader: null, lifeline_co_leaders: null, lifeline_members: null,
  ministry_involvements: null, is_youth_ya_core: true, completed_reach: false,
  completed_fresh_start: false, completed_freedom_day: false, completed_grand_day: false,
  is_admin: false, nickname: null, gender: null, marital_status: null, spouse_name: null,
  children_names: null, father_name: null, mother_name: null, emergency_contact_name: null,
  emergency_contact_number: null, occupation: null, date_joined_ctjcc: null,
  spiritual_birthday: null, baptized_in_water: false, member_group: null, is_guest: false,
  privacy_consent_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
})

const ALICE = mk("m1", "Alice", "Santos")
const BOB = mk("m2", "Bob", "Reyes")

const ALICE_HISTORY = [
  { id: "h1", event_name: "ALICE-ONLY RETREAT", checked_in_at: "2026-05-01T00:00:00Z" },
  { id: "h2", event_name: "ALICE-ONLY FELLOWSHIP", checked_in_at: "2026-06-01T00:00:00Z" },
]

let downloaded: Blob | null = null
let releaseBobDetail: (() => void) | null = null

function stub() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } })
    // "/api/admin/members" contains "/api/admin/me" — match exactly.
    if (url.endsWith("/api/admin/me")) return json({ authenticated: true, memberId: "x", email: "a@x", role: "admin" })
    if (url.endsWith("/api/admin/members")) return json({ members: [ALICE, BOB] })
    if (url.includes("/api/admin/members/m1")) return json({ member: ALICE, attendanceHistory: ALICE_HISTORY })
    if (url.includes("/api/admin/members/m2")) {
      // Bob's detail is slow — a venue wifi round trip.
      await new Promise<void>((r) => { releaseBobDetail = r })
      return json({ member: BOB, attendanceHistory: [] })
    }
    return json({})
  }))
  vi.stubGlobal("URL", Object.assign(globalThis.URL, {
    createObjectURL: (b: Blob) => { downloaded = b; return "blob:stub" },
    revokeObjectURL: () => {},
  }))
}

beforeEach(() => { downloaded = null; releaseBobDetail = null; vi.clearAllMocks(); stub() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/**
 * Regression guard for a leak that was live from 2026-04-02 to 2026-08-22.
 *
 * attendanceHistory is per-member state that selectMember only ever
 * OVERWROTE, never cleared. The member detail view renders synchronously from
 * the roster row, so between opening someone and their detail request
 * resolving, the previous member's attendance history was on screen — and the
 * Export Data button, which reads that same state, would bake it into the
 * downloaded JSON under the new person's name.
 *
 * The scenario below is the real one: open Alice, go back, open Bob while his
 * request is still in flight, export. On the pre-fix code this test fails with
 * Alice's events inside Bob's file.
 */
describe("member export cannot carry another member's attendance history", () => {
  it("exports an empty history while the detail request is still in flight", async () => {
    render(
      <RoleProvider>
        <MembersPage />
      </RoleProvider>,
    )

    // Open Alice, let her history load.
    await userEvent.click((await screen.findAllByText("Alice Santos"))[0])
    await screen.findByText("ALICE-ONLY RETREAT")

    // Back to the roster, then open Bob — whose detail request is in flight.
    await userEvent.click(screen.getByRole("button", { name: /Back/ }))
    await userEvent.click((await screen.findAllByText("Bob Reyes"))[0])

    // Bob's detail view is on screen NOW, before his fetch resolves.
    await screen.findByText(/Export Data/)
    await userEvent.click(screen.getByRole("button", { name: /Export Data/ }))

    expect(downloaded).not.toBeNull()
    const text = await downloaded!.text()
    const data = JSON.parse(text)

    expect(data.personalInfo.firstName).toBe("Bob")
    // Alice's events must not be anywhere in Bob's file.
    expect(JSON.stringify(data.attendanceHistory)).not.toContain("ALICE-ONLY")
    expect(data.attendanceHistory).toEqual([])

    releaseBobDetail?.()
  })
})
