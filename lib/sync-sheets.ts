import { toast } from "@/lib/toast"

/** Throttle: at most one warning every 30s so a flapping sync doesn't spam toasts */
let lastWarningAt = 0
function warnOnce(message: string) {
  const now = Date.now()
  if (now - lastWarningAt < 30_000) return
  lastWarningAt = now
  toast.warning(message, {
    description: "Your data is saved — Sheets will catch up later.",
  })
}

async function fireSync(body: unknown, label: string) {
  try {
    const res = await fetch("/api/sheets/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error(`Sheets ${label} sync HTTP ${res.status}`)
      warnOnce("Google Sheets sync delayed")
    }
  } catch (err) {
    console.error(`Sheets ${label} sync failed:`, err)
    warnOnce("Google Sheets sync delayed")
  }
}

/** Fire-and-forget sync to Google Sheets via API route */
export function syncMember(memberId: string) {
  void fireSync({ type: "member", data: { memberId } }, "member")
}

export function syncAttendance(memberId: string, eventId: string) {
  void fireSync({ type: "attendance", data: { memberId, eventId } }, "attendance")
}
