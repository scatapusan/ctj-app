import { NextResponse } from "next/server"
import { google } from "googleapis"

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
]

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

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: SCOPES,
  })
}

export async function POST() {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: "v4", auth })
    const drive = google.drive({ version: "v3", auth })

    // 1. Create a new spreadsheet with Members and Attendance tabs
    const newSheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: "CTJCC Marikina - Youth & YA (App Sync)",
        },
        sheets: [
          { properties: { title: "Members" } },
          { properties: { title: "Attendance" } },
        ],
      },
    })

    const newSheetId = newSheet.data.spreadsheetId!

    // 2. Write headers to both tabs
    await Promise.all([
      sheets.spreadsheets.values.update({
        spreadsheetId: newSheetId,
        range: "'Members'!A1",
        valueInputOption: "RAW",
        requestBody: { values: [MEMBERS_HEADERS] },
      }),
      sheets.spreadsheets.values.update({
        spreadsheetId: newSheetId,
        range: "'Attendance'!A1",
        valueInputOption: "RAW",
        requestBody: { values: [ATTENDANCE_HEADERS] },
      }),
    ])

    // 3. Share with the owner so they can see it in their Drive
    await drive.permissions.create({
      fileId: newSheetId,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: "samcataps@gmail.com",
      },
    })

    return NextResponse.json({
      ok: true,
      newSheetId,
      url: `https://docs.google.com/spreadsheets/d/${newSheetId}/edit`,
      message: "New sheet created with headers. Update GOOGLE_SHEET_ID in .env.local, then run Bubble import.",
    })
  } catch (err: unknown) {
    console.error("Sheet init error:", err)
    const gErr = err as { response?: { data?: unknown }; message?: string; code?: number }
    return NextResponse.json(
      {
        error: "Failed to create sheet",
        details: gErr.response?.data || gErr.message || String(err),
        serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "NOT SET",
        hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      },
      { status: 500 }
    )
  }
}
