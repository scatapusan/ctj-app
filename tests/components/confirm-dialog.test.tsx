// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useState } from "react"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmDialog, useConfirm } from "@/components/admin/confirm-dialog"

/**
 * The confirmation dialog is the guard on every admin action that changes
 * stored data — cancelling a registration, deleting a member or an event,
 * resetting somebody's PIN, overwriting the Google Sheet. These tests are about
 * the properties that make it a guard rather than a speed bump: it cannot be
 * dismissed INTO the destructive action, and the promise it hands back never
 * resolves true unless a person pressed the confirm button.
 */

afterEach(cleanup)

describe("ConfirmDialog", () => {
  const props = {
    title: "Permanently delete Juan Dela Cruz?",
    confirmLabel: "Delete permanently",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => vi.clearAllMocks())

  it("announces itself as an alert dialog naming the record", () => {
    render(<ConfirmDialog {...props} body="This cannot be undone." />)
    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveAccessibleName("Permanently delete Juan Dela Cruz?")
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.")
  })

  it("puts focus on CANCEL, so a reflexive Enter destroys nothing", async () => {
    render(<ConfirmDialog {...props} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())

    await userEvent.keyboard("{Enter}")
    expect(props.onConfirm).not.toHaveBeenCalled()
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it("confirms only when the confirm button is pressed", async () => {
    render(<ConfirmDialog {...props} />)
    await userEvent.click(screen.getByRole("button", { name: "Delete permanently" }))
    expect(props.onConfirm).toHaveBeenCalledTimes(1)
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it("cancels on Escape, never confirms", async () => {
    render(<ConfirmDialog {...props} />)
    await userEvent.keyboard("{Escape}")
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it("cancels when the backdrop is tapped", async () => {
    const { container } = render(<ConfirmDialog {...props} />)
    const backdrop = container.querySelector('[aria-hidden="true"]')!
    await userEvent.click(backdrop)
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it("keeps Tab inside the dialog, so the buttons behind it stay unreachable", async () => {
    render(
      <>
        <button type="button">Behind the dialog</button>
        <ConfirmDialog {...props} />
      </>,
    )
    const cancel = screen.getByRole("button", { name: "Cancel" })
    const confirmBtn = screen.getByRole("button", { name: "Delete permanently" })
    const outside = screen.getByRole("button", { name: "Behind the dialog" })

    await waitFor(() => expect(cancel).toHaveFocus())
    await userEvent.tab()
    expect(confirmBtn).toHaveFocus()
    await userEvent.tab()
    // Wrapped back to the start rather than escaping to the page behind.
    expect(cancel).toHaveFocus()
    expect(outside).not.toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(confirmBtn).toHaveFocus()
  })

  it("holds the page still while it is open and lets go afterwards", () => {
    document.body.style.overflow = "auto"
    const { unmount } = render(<ConfirmDialog {...props} />)
    expect(document.body.style.overflow).toBe("hidden")
    unmount()
    expect(document.body.style.overflow).toBe("auto")
  })

  it("gives focus back to whatever opened it", async () => {
    render(<button type="button">Delete Member</button>)
    const opener = screen.getByRole("button", { name: "Delete Member" })
    opener.focus()
    expect(opener).toHaveFocus()

    const { unmount } = render(<ConfirmDialog {...props} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
    unmount()
    expect(opener).toHaveFocus()
  })

  it("labels the confirm button with the verb, not a bare Yes/OK", () => {
    render(<ConfirmDialog {...props} confirmLabel="Reset PIN" />)
    expect(screen.getByRole("button", { name: "Reset PIN" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^(ok|yes)$/i })).toBeNull()
  })

  it("takes a custom cancel label so 'Cancel' never means two things at once", () => {
    // "Cancel a registration" vs "Cancel this dialog" — the destructive verb is
    // already the word Cancel on the attendance screen.
    render(<ConfirmDialog {...props} confirmLabel="Cancel registration" cancelLabel="Keep it" />)
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel registration" })).toBeInTheDocument()
  })

  it("renders both tones without changing which button is which", async () => {
    const { unmount } = render(<ConfirmDialog {...props} tone="default" />)
    await userEvent.click(screen.getByRole("button", { name: "Delete permanently" }))
    expect(props.onConfirm).toHaveBeenCalledTimes(1)
    unmount()

    render(<ConfirmDialog {...props} tone="destructive" />)
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })
})

/** A stand-in for a real admin screen: one guarded action, one visible result. */
function Harness({ onRun }: { onRun: (ran: boolean) => void }) {
  const { confirm, confirmDialog } = useConfirm()
  const [log, setLog] = useState<string[]>([])

  async function run() {
    const ok = await confirm({ title: "Do the thing?", confirmLabel: "Do it" })
    onRun(ok)
    setLog((l) => [...l, ok ? "ran" : "skipped"])
  }

  return (
    <>
      <button type="button" onClick={run}>
        Run
      </button>
      <output>{log.join(",")}</output>
      {confirmDialog}
    </>
  )
}

describe("useConfirm", () => {
  it("does not run the action until the person confirms", async () => {
    const onRun = vi.fn()
    render(<Harness onRun={onRun} />)

    await userEvent.click(screen.getByRole("button", { name: "Run" }))
    // The dialog is up and the caller is still waiting — nothing has happened.
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument()
    expect(onRun).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Do it" }))
    await waitFor(() => expect(onRun).toHaveBeenCalledWith(true))
    expect(screen.getByText("ran")).toBeInTheDocument()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("resolves false on cancel, so the guard clause skips the action", async () => {
    const onRun = vi.fn()
    render(<Harness onRun={onRun} />)

    await userEvent.click(screen.getByRole("button", { name: "Run" }))
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(onRun).toHaveBeenCalledWith(false))
    expect(screen.getByText("skipped")).toBeInTheDocument()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("closes and reopens cleanly for a second action", async () => {
    const onRun = vi.fn()
    render(<Harness onRun={onRun} />)

    await userEvent.click(screen.getByRole("button", { name: "Run" }))
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole("button", { name: "Run" }))
    await userEvent.click(await screen.findByRole("button", { name: "Do it" }))
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(2))
    expect(onRun).toHaveBeenLastCalledWith(true)
    expect(screen.getByText("skipped,ran")).toBeInTheDocument()
  })

  it("never leaves a caller waiting forever when the screen unmounts", async () => {
    const onRun = vi.fn()
    const { unmount } = render(<Harness onRun={onRun} />)

    await userEvent.click(screen.getByRole("button", { name: "Run" }))
    await screen.findByRole("alertdialog")
    unmount()

    // Resolved false rather than hanging — the action stays un-run.
    await waitFor(() => expect(onRun).toHaveBeenCalledWith(false))
  })
})
