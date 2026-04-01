/** Fire-and-forget sync to Google Sheets via API route */
export function syncMember(memberId: string) {
  fetch("/api/sheets/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "member", data: { memberId } }),
  }).catch((err) => console.error("Sheets member sync failed:", err))
}

export function syncAttendance(memberId: string, eventId: string) {
  fetch("/api/sheets/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "attendance", data: { memberId, eventId } }),
  }).catch((err) => console.error("Sheets attendance sync failed:", err))
}
