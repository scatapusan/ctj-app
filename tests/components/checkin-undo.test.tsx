// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/** Captures the toast so a test can invoke the Undo action it offers. */
const toastCalls: { kind: string; message: string; opts?: Record<string, unknown> }[] = []
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (message: string, opts?: Record<string, unknown>) => {
      toastCalls.push({ kind: "success", message, opts })
    },
    error: (message: string, opts?: Record<string, unknown>) => {
      toastCalls.push({ kind: "error", message, opts })
    },
  },
}))

import CheckinPage from "@/app/admin/(dashboard)/checkin/page"
import { RoleProvider } from "@/components/admin/role-provider"

/**
 * The door queue, and its correction path.
 *
 * Marking attended must stay ONE tap — around 44 of them with people waiting,
 * so a confirmation would double the work and get dismissed unread. What makes
 * that safe is that it is now reversible, in two places: an Undo on the toast
 * for the mis-tap you catch instantly, and an Undo on the attended row for the
 * one you catch ten minutes later.
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

function rosterRow(id: string, name: string, status: "registered" | "attended") {
  return {
    attendanceId: id,
    memberId: `m-${id}`,
    name,
    nickname: null,
    isGuest: false,
    status,
    checkedInAt: "2026-08-15T02:30:00Z",
    attendedAt: status === "attended" ? "2026-08-30T01:00:00Z" : null,
    category: "ya",
    isCore: false,
    babyPhotoUrl: null,
    hasGuardian: false,
  }
}

const ROSTER = [
  rosterRow("a1", "Juan Dela Cruz", "registered"),
  rosterRow("a2", "Ana Reyes", "attended"),
]

let calls: { url: string; method: string }[] = []

function stubFetch() {
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
        return json({ authenticated: true, memberId: "m-core", email: "c@ctj.test", role: "core" })
      }
      if (url.includes("/api/admin/events")) return json({ events: [EVENT] })
      if (url.includes("/api/admin/checkin?eventId")) return json({ roster: ROSTER })
      return json({ ok: true, attendedAt: "2026-08-30T02:00:00Z" })
    }),
  )
}

async function openEvent() {
  render(
    <RoleProvider>
      <CheckinPage />
    </RoleProvider>,
  )
  await userEvent.click(await screen.findByRole("button", { name: /CTJ Retreat 2026/ }))
  await screen.findByText("Juan Dela Cruz")
}

const mutations = () => calls.filter((c) => c.method !== "GET")

beforeEach(() => {
  calls = []
  toastCalls.length = 0
  vi.clearAllMocks()
  stubFetch()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("marking attended stays one tap", () => {
  it("asks nothing and posts immediately", async () => {
    await openEvent()
    await userEvent.click(screen.getAllByRole("button", { name: /Mark attended/ })[0])

    // No dialog stood between the tap and the write.
    expect(screen.queryByRole("alertdialog")).toBeNull()
    await waitFor(() => expect(mutations()).toHaveLength(1))
    expect(mutations()[0].method).toBe("POST")
  })

  it("offers an Undo on the success toast", async () => {
    await openEvent()
    await userEvent.click(screen.getAllByRole("button", { name: /Mark attended/ })[0])

    await waitFor(() => expect(toastCalls).toHaveLength(1))
    const [t] = toastCalls
    expect(t.kind).toBe("success")
    expect(t.message).toContain("Juan Dela Cruz")
    expect((t.opts?.action as { label: string }).label).toBe("Undo")
  })

  it("reverses the mark when that Undo is taken, without asking", async () => {
    await openEvent()
    await userEvent.click(screen.getAllByRole("button", { name: /Mark attended/ })[0])
    await waitFor(() => expect(toastCalls).toHaveLength(1))

    const action = toastCalls[0].opts?.action as { onClick: () => void }
    await action.onClick()

    // Undoing what you just did needs no ceremony.
    expect(screen.queryByRole("alertdialog")).toBeNull()
    await waitFor(() => expect(mutations()).toHaveLength(2))
    expect(mutations()[1].method).toBe("DELETE")
    expect(mutations()[1].url).toContain("attendanceId=a1")
  })
})

describe("undoing an attendance mark from the roster", () => {
  it("gives every attended row its own Undo control", async () => {
    await openEvent()
    const attended = screen.getByText("Ana Reyes").closest("div")!.parentElement!
    expect(within(attended).getByRole("button", { name: /Undo/ })).toBeInTheDocument()
  })

  it("confirms first — this one changes a record from earlier in the day", async () => {
    await openEvent()
    await userEvent.click(screen.getByRole("button", { name: /^Undo$/ }))

    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveAccessibleName("Undo attendance for Ana Reyes?")
    expect(mutations()).toEqual([])
  })

  it("writes nothing when that confirmation is declined", async () => {
    await openEvent()
    await userEvent.click(screen.getByRole("button", { name: /^Undo$/ }))
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(mutations()).toEqual([])
  })

  it("moves the person back to pre-registered once confirmed", async () => {
    await openEvent()
    await userEvent.click(screen.getByRole("button", { name: /^Undo$/ }))
    await userEvent.click(await screen.findByRole("button", { name: "Undo attendance" }))

    await waitFor(() => expect(mutations()).toHaveLength(1))
    expect(mutations()[0].method).toBe("DELETE")
    expect(mutations()[0].url).toContain("attendanceId=a2")

    // The list reflects it without a reload: Ana leaves Attended and rejoins
    // the working list, which is where a leader would look for her next.
    await waitFor(() => {
      expect(screen.getByText(/Pre-registered \(2\)/)).toBeInTheDocument()
    })
  })

  it("no longer tells leaders that marking is one-way", async () => {
    await openEvent()
    expect(screen.queryByText(/Marking is one-way/)).toBeNull()
    expect(screen.getByText(/Marked someone by mistake\?/)).toBeInTheDocument()
  })
})
