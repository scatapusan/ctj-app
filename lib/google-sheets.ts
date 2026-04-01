import { google } from "googleapis"
import type { Member } from "./types"

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: SCOPES,
  })
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() })
}

const SHEET_ID = () => process.env.GOOGLE_SHEET_ID!

// --- Column mapping ---

const MEMBERS_HEADERS = [
  "Full Name", "Nickname", "Email", "Birthdate", "Age", "Gender", "Occupation",
  "Address", "Contact #", "Facebook Link", "Discipler / Mentor", "Disciple/s",
  "Prospect Disciples", "Lifeline Leader/s", "Lifeline Co-Leaders",
  "Lifeline Members", "Ministry", "Youth/YA Core", "REACH Seminar",
  "Fresh Start", "Freedom Day", "Grand Day", "Baptized in Water",
  "Father's Name", "Mother's Name", "Emergency Contact", "Emergency #",
  "Date Joined CTJCC", "Spiritual Birthday",
]

const ATTENDANCE_HEADERS = ["Full Name", "Email", "Event", "Checked In At"]

function computeAge(birthdate: string | null): string {
  if (!birthdate) return ""
  const birth = new Date(birthdate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return age >= 0 ? String(age) : ""
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ""
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function boolToStatus(val: boolean): string {
  return val ? "Done" : "Not Yet"
}

function boolToYesNo(val: boolean): string {
  return val ? "Yes" : "No"
}

function fullName(m: Member): string {
  const middle = m.middle_name ? ` ${m.middle_name.charAt(0)}.` : ""
  return `${m.first_name}${middle} ${m.last_name}`
}

export function memberToRow(m: Member): string[] {
  return [
    fullName(m),
    m.nickname || "",
    m.email,
    formatDate(m.birthdate),
    computeAge(m.birthdate),
    m.gender || "",
    m.occupation || "",
    m.address || "",
    m.contact_number || "",
    m.facebook_link || "",
    m.discipler_name || "",
    m.disciples || "",
    m.prospect_disciples || "",
    m.lifeline_leader || "",
    m.lifeline_co_leaders || "",
    m.lifeline_members || "",
    m.ministry_involvements || "",
    boolToYesNo(m.is_youth_ya_core),
    boolToStatus(m.completed_reach),
    boolToStatus(m.completed_fresh_start),
    boolToStatus(m.completed_freedom_day),
    boolToStatus(m.completed_grand_day),
    boolToYesNo(m.baptized_in_water),
    m.father_name || "",
    m.mother_name || "",
    m.emergency_contact_name || "",
    m.emergency_contact_number || "",
    m.date_joined_ctjcc ? formatDate(m.date_joined_ctjcc) : "",
    m.spiritual_birthday ? formatDate(m.spiritual_birthday) : "",
  ]
}

export function attendanceToRow(
  memberName: string,
  email: string,
  eventName: string,
  checkedInAt: string
): string[] {
  const d = new Date(checkedInAt)
  const formatted = isNaN(d.getTime())
    ? checkedInAt
    : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
  return [memberName, email, eventName, formatted]
}

// --- Sheet operations ---

async function ensureTab(tabName: string, headers: string[]) {
  const sheets = getSheets()
  const spreadsheetId = SHEET_ID()

  // Check if tab exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === tabName
  )

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    })
    // Write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    })
  }
}

/** Upsert a member row — find by email (col C), update or append */
export async function syncMemberToSheet(member: Member) {
  const sheets = getSheets()
  const spreadsheetId = SHEET_ID()
  const tab = "Members"

  await ensureTab(tab, MEMBERS_HEADERS)

  // Read email column to find existing row
  const emailCol = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab}'!C:C`,
  })

  const emails = emailCol.data.values || []
  const rowIndex = emails.findIndex(
    (row) => row[0]?.toLowerCase().trim() === member.email.toLowerCase().trim()
  )

  const row = memberToRow(member)

  if (rowIndex > 0) {
    // Update existing row (rowIndex is 0-based, row 0 is header, so sheet row = rowIndex + 1)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab}'!A${rowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    })
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${tab}'!A:AC`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    })
  }
}

/** Append an attendance record row */
export async function syncAttendanceToSheet(
  memberName: string,
  email: string,
  eventName: string,
  checkedInAt: string
) {
  const sheets = getSheets()
  const spreadsheetId = SHEET_ID()
  const tab = "Attendance"

  await ensureTab(tab, ATTENDANCE_HEADERS)

  const row = attendanceToRow(memberName, email, eventName, checkedInAt)

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tab}'!A:D`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  })
}

/** Full export: clear and rewrite both tabs */
export async function exportAllToSheet(
  members: Member[],
  attendanceRecords: { memberName: string; email: string; eventName: string; checkedInAt: string }[]
) {
  const sheets = getSheets()
  const spreadsheetId = SHEET_ID()

  // --- Members tab ---
  await ensureTab("Members", MEMBERS_HEADERS)
  // Clear existing data (keep nothing)
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "'Members'!A:AC",
  })
  // Write headers + all rows
  const memberRows = [MEMBERS_HEADERS, ...members.map(memberToRow)]
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Members'!A1",
    valueInputOption: "RAW",
    requestBody: { values: memberRows },
  })

  // --- Attendance tab ---
  await ensureTab("Attendance", ATTENDANCE_HEADERS)
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "'Attendance'!A:D",
  })
  const attendanceRows = [
    ATTENDANCE_HEADERS,
    ...attendanceRecords.map((r) =>
      attendanceToRow(r.memberName, r.email, r.eventName, r.checkedInAt)
    ),
  ]
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Attendance'!A1",
    valueInputOption: "RAW",
    requestBody: { values: attendanceRows },
  })

  return { members: members.length, attendance: attendanceRecords.length }
}
