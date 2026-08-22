// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Toasts are noise here, and sonner wants a <Toaster> mounted.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import AttendancePage from "@/app/admin/(dashboard)/attendance/page"
import { RoleProvider } from "@/components/admin/role-provider"

/**
 * The two things the ministry asked for on this screen:
 *
 *   1. the row must not put an irreversible delete a thumb-width from the
 *      button people tap dozens of times, and
 *   2. nothing may change a stored record on a single tap — the category
 *      dropdown included, which was the specific complaint.
 *
 * These drive the real page component with fetch stubbed, so they fail if the
 * confirmation is removed, if it stops blocking the request, or if the delete
 * control reappears in the row.
 */

const EVENT = {
  id: "e1",
  name: "CTJ Retreat 2026",
  description: null,
  event_date: "2026-08-30",
  is_active: true,
  created_at: "2026-08-01T00:00:00Z",
  registration_mode: "retreat",
}

const RECORDS = [
  {
    id: "a1",
    member_name: "Juan Dela Cruz",
    email: "juan@ctj.test",
    checked_in_at: "2026-08-15T02:30:00Z",
    status: "registered",
    attended_at: null,
    category: "youth",
    is_core: false,
    has_baby_photo: true,
  },
  {
    id: "a2",
    member_name: "Ana Reyes",
    email: "ana@ctj.test",
    checked_in_at: "2026-08-15T03:30:00Z",
    status: "attended",
    attended_at: "2026-08-30T01:00:00Z",
    category: "ya",
    is_core: false,
    has_baby_photo: false,
  },
]

const DETAIL = {
  id: "a1",
  memberId: "m1",
  eventId: "e1",
  eventName: "CTJ Retreat 2026",
  eventDate: "2026-08-30",
  firstName: "Juan",
  middleName: null,
  lastName: "Dela Cruz",
  name: "Juan Dela Cruz",
  nickname: "JD",
  email: "juan@ctj.test",
  birthdate: "2010-09-05",
  age: 15,
  address: "12 Shoe Ave, Marikina",
  contactNumber: "09171234567",
  category: "youth",
  isCore: false,
  categoryLabel: "Youth",
  status: "registered",
  registeredAt: "2026-08-15T02:30:00Z",
  attendedAt: null,
  guardianName: "Maria Dela Cruz",
  guardianContact: "09181234567",
  hasBabyPhoto: false,
  babyPhotoUrl: null,
}

/** Every request the page made, so a test can assert one never happened. */
let calls: { url: string; method: string }[] = []

function stubFetch(role: "admin" | "core" = "admin") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? "GET" })

      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })

      if (url.includes("/api/admin/me")) {
        return json({ authenticated: true, memberId: "m-admin", email: "a@ctj.test", role })
      }
      if (url.includes("/api/admin/events")) return json({ events: [EVENT] })
      if (url.includes("/api/admin/attendance?")) return json({ records: RECORDS })
      if (/\/api\/admin\/attendance\/a\d/.test(url)) return json({ record: DETAIL })
      if (url.includes("/api/admin/attendance")) return json({ ok: true })
      return json({})
    }),
  )
}

/**
 * Render inside the real RoleProvider — the admin-only controls are gated on
 * it, so a bare render would silently make every "the control is absent"
 * assertion pass for the wrong reason.
 */
async function openEvent() {
  render(
    <RoleProvider>
      <AttendancePage />
    </RoleProvider>,
  )
  const eventButton = await screen.findByRole("button", { name: /CTJ Retreat 2026/ })
  await userEvent.click(eventButton)
  await screen.findAllByText("Juan Dela Cruz")
}

const mutations = () => calls.filter((c) => c.method !== "GET")

beforeEach(() => {
  calls = []
  vi.clearAllMocks()
  stubFetch()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("attendance rows — nothing destructive sits next to the view control", () => {
  it("offers no delete control in the row, even for an admin who has the power", async () => {
    await openEvent()
    // The session really is an admin: the admin-only control exists, just not
    // in the row. Without this the assertions below would pass vacuously.
    await userEvent.click(
      screen.getAllByRole("button", { name: "View full details for Juan Dela Cruz" })[0],
    )
    await screen.findByRole("button", { name: /Cancel this registration/ })
    await userEvent.click(screen.getByRole("button", { name: "Close registrant details" }))

    // It used to be a trash icon immediately beside the eye icon.
    expect(screen.queryByRole("button", { name: /Cancel registration for/ })).toBeNull()
    expect(screen.queryByTitle("Cancel this registration")).toBeNull()
  })

  it("keeps the view control, as a real button a screen reader can name", async () => {
    await openEvent()
    const view = screen.getAllByRole("button", { name: "View full details for Juan Dela Cruz" })
    expect(view.length).toBeGreaterThan(0)
  })
})

describe("category dropdown — no record changes on a single tap", () => {
  it("asks before writing, and writes nothing while the question is open", async () => {
    await openEvent()

    const select = screen.getAllByRole("combobox", { name: "Category for Juan Dela Cruz" })[0]
    await userEvent.selectOptions(select, "core")

    // The dialog is up…
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveAccessibleName("Change Juan Dela Cruz to Core?")
    // …and nothing has been written.
    expect(mutations()).toEqual([])
  })

  it("writes nothing when the change is cancelled", async () => {
    await openEvent()

    const select = screen.getAllByRole("combobox", { name: "Category for Juan Dela Cruz" })[0]
    await userEvent.selectOptions(select, "core")
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(mutations()).toEqual([])
  })

  it("writes the change once the person confirms", async () => {
    await openEvent()

    const select = screen.getAllByRole("combobox", { name: "Category for Juan Dela Cruz" })[0]
    await userEvent.selectOptions(select, "core")
    await userEvent.click(await screen.findByRole("button", { name: "Set to Core" }))

    await waitFor(() => expect(mutations()).toHaveLength(1))
    expect(mutations()[0].method).toBe("PATCH")
    expect(mutations()[0].url).toContain("/api/admin/attendance")
  })

  it("names the person and the new label, so the dialog is worth reading", async () => {
    await openEvent()

    const select = screen.getAllByRole("combobox", { name: "Category for Ana Reyes" })[0]
    await userEvent.selectOptions(select, "youth")

    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveAccessibleName("Change Ana Reyes to Youth?")
    expect(within(dialog).getByRole("button", { name: "Set to Youth" })).toBeInTheDocument()
  })
})

describe("cancelling a registration — only from the opened record", () => {
  async function openDetail() {
    await openEvent()
    await userEvent.click(
      screen.getAllByRole("button", { name: "View full details for Juan Dela Cruz" })[0],
    )
    // The panel is open with the record loaded — the address proves it.
    await screen.findByText("12 Shoe Ave, Marikina")
  }

  it("is only reachable after opening the record", async () => {
    await openDetail()
    expect(screen.getByRole("button", { name: /Cancel this registration/ })).toBeInTheDocument()
  })

  it("deletes nothing until the confirmation is answered", async () => {
    await openDetail()
    await userEvent.click(screen.getByRole("button", { name: /Cancel this registration/ }))

    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveAccessibleName("Cancel Juan Dela Cruz's pre-registration?")
    expect(mutations()).toEqual([])

    // "Keep it", not "Cancel" — the destructive verb here is already "Cancel".
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(mutations()).toEqual([])
  })

  it("issues the DELETE once confirmed", async () => {
    await openDetail()
    await userEvent.click(screen.getByRole("button", { name: /Cancel this registration/ }))
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Cancel registration",
      }),
    )

    await waitFor(() => expect(mutations()).toHaveLength(1))
    expect(mutations()[0].method).toBe("DELETE")
    expect(mutations()[0].url).toContain("id=a1")
  })

  it("shows no cancel control to a core leader, anywhere", async () => {
    cleanup()
    calls = []
    stubFetch("core")
    await openEvent()
    expect(screen.queryByRole("button", { name: /Cancel registration for/ })).toBeNull()

    await userEvent.click(
      screen.getAllByRole("button", { name: "View full details for Juan Dela Cruz" })[0],
    )
    await screen.findByText("12 Shoe Ave, Marikina")
    // The endpoint is admin-only, so the control is absent rather than failing.
    expect(screen.queryByRole("button", { name: /Cancel this registration/ })).toBeNull()
  })
})
