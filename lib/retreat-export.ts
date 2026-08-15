import { categoryLabel, type RetreatCategory } from "@/lib/types"

/**
 * CSV export of one event's registrations, including everything the retreat
 * form collects. Kept out of the route handler so the column set, the escaping
 * and the age arithmetic are unit-testable without a Supabase client.
 *
 * PRIVACY: these rows carry minors' home addresses and phone numbers, plus
 * guardian contacts. The route that calls this is admin-only (NOT core) and
 * sends no-store — see app/api/admin/attendance/export/route.ts.
 */

/**
 * The ministry runs on Manila time. The old export was built in the leader's
 * browser, so timestamps came out local; this one is built on the server, which
 * runs in UTC. Pinning the zone keeps the exported times identical to what the
 * admin console shows instead of silently shifting them 8 hours.
 */
export const EXPORT_TIME_ZONE = "Asia/Manila"

export interface RetreatExportRow {
  firstName: string
  lastName: string
  nickname: string | null
  email: string
  category: RetreatCategory | null
  isCore: boolean
  status: string
  birthdate: string | null
  address: string | null
  contactNumber: string | null
  guardianName: string | null
  guardianContact: string | null
  /** Bucket object path, e.g. 'baby-1786166356633-ej1nor96lw.jpeg'. Permanent. */
  babyPhotoFile: string | null
  /** Short-lived signed URL, or null when signing failed / there is no photo. */
  babyPhotoLink: string | null
  registeredAt: string | null
  attendedAt: string | null
}

export const RETREAT_EXPORT_HEADERS = [
  "Name",
  "Nickname",
  "Email",
  "Category",
  "Status",
  "Birthday",
  "Age",
  "Address",
  "Contact Number",
  "Guardian Name",
  "Guardian Contact",
  "Baby Photo File",
  "Baby Photo Link",
  "Registered At",
  "Attended At",
] as const

/**
 * Spreadsheet formula injection guard. A registrant types their own address and
 * phone number, so a cell could begin with a character that Excel and Sheets
 * treat as the start of a formula. Prefixing with an apostrophe marks the cell
 * as text; both apps consume the apostrophe rather than displaying it.
 *
 * This is not only a safety measure: Philippine mobile numbers are routinely
 * written '+639171234567', which Excel would otherwise mangle into a formula
 * error.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/** One RFC 4180 cell: always quoted, inner quotes doubled, formulas defused. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""'
  const text = typeof value === "number" ? String(value) : value
  return `"${neutralizeFormula(text).replace(/"/g, '""')}"`
}

/**
 * Whole years between a yyyy-mm-dd birthdate and a reference date.
 * Returns null for a missing or unparseable birthday rather than guessing.
 */
export function ageOnDate(birthdate: string | null | undefined, on: Date): number | null {
  if (!birthdate) return null
  const born = new Date(`${birthdate.slice(0, 10)}T00:00:00Z`)
  if (isNaN(born.getTime())) return null
  let age = on.getUTCFullYear() - born.getUTCFullYear()
  const monthDiff = on.getUTCMonth() - born.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < born.getUTCDate())) age--
  return age < 0 || age > 120 ? null : age
}

/** 'yyyy-MM-dd HH:mm:ss' in Manila time, or '' for a null timestamp. */
export function formatExportTimestamp(iso: string | null | undefined): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EXPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  // en-CA gives a 24-hour clock, but midnight can come back as '24' on some ICU
  // builds — normalise it so the string is always a valid timestamp.
  const hour = get("hour") === "24" ? "00" : get("hour")
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`
}

/** UI-facing status wording, matching the badges on the attendance screen. */
function statusLabel(status: string): string {
  return status === "registered" ? "Pre-registered" : status === "attended" ? "Attended" : status
}

/**
 * Build the CSV body. `ageOn` is the date ages are computed against — the event
 * date, so "Age" answers "how old are they AT the retreat", which is the number
 * that decides who is a minor on the day.
 */
export function buildRetreatCsv(rows: RetreatExportRow[], ageOn: Date): string {
  const header = RETREAT_EXPORT_HEADERS.map(csvCell).join(",")
  const body = rows.map((row) =>
    [
      csvCell(`${row.firstName} ${row.lastName}`.trim()),
      csvCell(row.nickname),
      csvCell(row.email),
      csvCell(categoryLabel(row.category, row.isCore)),
      csvCell(statusLabel(row.status)),
      csvCell(row.birthdate ? row.birthdate.slice(0, 10) : ""),
      csvCell(ageOnDate(row.birthdate, ageOn)),
      csvCell(row.address),
      csvCell(row.contactNumber),
      csvCell(row.guardianName),
      csvCell(row.guardianContact),
      csvCell(row.babyPhotoFile),
      csvCell(row.babyPhotoLink),
      csvCell(formatExportTimestamp(row.registeredAt)),
      csvCell(formatExportTimestamp(row.attendedAt)),
    ].join(","),
  )
  // CRLF per RFC 4180 — Excel is the likeliest consumer here.
  return [header, ...body].join("\r\n")
}

/** Safe, descriptive download filename: no quotes, slashes or newlines. */
export function exportFilename(eventName: string | null | undefined, on: Date): string {
  const slug =
    (eventName ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "export"
  const stamp = formatExportTimestamp(on.toISOString()).slice(0, 10)
  return `attendance-${slug}-${stamp}.csv`
}
