import { describe, it, expect } from "vitest"
import {
  buildRetreatCsv,
  csvCell,
  ageOnDate,
  formatExportTimestamp,
  exportFilename,
  RETREAT_EXPORT_HEADERS,
  type RetreatExportRow,
} from "@/lib/retreat-export"

const EVENT_DATE = new Date("2026-08-30T00:00:00Z")

function row(overrides: Partial<RetreatExportRow> = {}): RetreatExportRow {
  return {
    firstName: "Juan",
    lastName: "Dela Cruz",
    nickname: "JD",
    email: "juan@ctj.test",
    category: "youth",
    isCore: false,
    status: "registered",
    birthdate: "2010-09-05",
    address: "12 Shoe Ave, Marikina",
    contactNumber: "09171234567",
    guardianName: "Maria Dela Cruz",
    guardianContact: "09181234567",
    babyPhotoFile: "baby-1786166356633-ej1nor96lw.jpeg",
    babyPhotoLink: "https://signed.test/baby.jpeg?token=abc",
    registeredAt: "2026-08-15T02:30:00Z",
    attendedAt: null,
    ...overrides,
  }
}

/** Split a single-quoted-cell CSV line back into raw cell values. */
function cells(line: string): string[] {
  return line
    .slice(1, -1)
    .split('","')
    .map((c) => c.replace(/""/g, '"'))
}

describe("csvCell", () => {
  it("quotes every value and doubles inner quotes", () => {
    expect(csvCell("plain")).toBe('"plain"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it("keeps commas and newlines inside the quoted cell", () => {
    expect(csvCell("12 Shoe Ave, Marikina")).toBe('"12 Shoe Ave, Marikina"')
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"')
  })

  it("renders null and undefined as empty cells", () => {
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })

  it("renders numbers, including zero", () => {
    expect(csvCell(0)).toBe('"0"')
    expect(csvCell(23)).toBe('"23"')
  })

  it("defuses spreadsheet formulas typed into free-text fields", () => {
    // A registrant controls their own address/name fields.
    expect(csvCell("=HYPERLINK(\"http://evil.test\")")).toBe(
      '"\'=HYPERLINK(""http://evil.test"")"',
    )
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"')
    expect(csvCell("-1+1")).toBe('"\'-1+1"')
  })

  it("keeps +63 mobile numbers intact as text rather than a formula", () => {
    expect(csvCell("+639171234567")).toBe("\"'+639171234567\"")
  })

  it("leaves ordinary local mobile numbers untouched", () => {
    expect(csvCell("09171234567")).toBe('"09171234567"')
  })
})

describe("ageOnDate", () => {
  it("counts whole years at the reference date", () => {
    expect(ageOnDate("2000-01-01", EVENT_DATE)).toBe(26)
  })

  it("does not credit a birthday that falls after the event", () => {
    // Turns 16 on Sep 5, six days after the Aug 30 retreat.
    expect(ageOnDate("2010-09-05", EVENT_DATE)).toBe(15)
  })

  it("counts a birthday landing exactly on the event date", () => {
    expect(ageOnDate("2008-08-30", EVENT_DATE)).toBe(18)
  })

  it("returns null for a missing or unparseable birthday", () => {
    expect(ageOnDate(null, EVENT_DATE)).toBeNull()
    expect(ageOnDate("", EVENT_DATE)).toBeNull()
    expect(ageOnDate("not-a-date", EVENT_DATE)).toBeNull()
  })

  it("tolerates a full timestamp in the birthdate column", () => {
    expect(ageOnDate("2010-09-05T00:00:00+08:00", EVENT_DATE)).toBe(15)
  })
})

describe("formatExportTimestamp", () => {
  it("renders UTC timestamps in Manila time", () => {
    // 02:30 UTC is 10:30 the same morning in Manila (UTC+8).
    expect(formatExportTimestamp("2026-08-15T02:30:00Z")).toBe("2026-08-15 10:30:00")
  })

  it("rolls the date forward across the Manila midnight boundary", () => {
    expect(formatExportTimestamp("2026-08-14T16:00:00Z")).toBe("2026-08-15 00:00:00")
  })

  it("renders an empty cell for null and invalid input", () => {
    expect(formatExportTimestamp(null)).toBe("")
    expect(formatExportTimestamp("")).toBe("")
    expect(formatExportTimestamp("nonsense")).toBe("")
  })
})

describe("buildRetreatCsv", () => {
  it("emits every requested column in the header", () => {
    const header = buildRetreatCsv([], EVENT_DATE).split("\r\n")[0]
    expect(cells(header)).toEqual([...RETREAT_EXPORT_HEADERS])
    // The fields this export exists to add.
    for (const col of [
      "Birthday",
      "Age",
      "Address",
      "Contact Number",
      "Guardian Name",
      "Guardian Contact",
      "Baby Photo File",
      "Baby Photo Link",
    ]) {
      expect(header).toContain(`"${col}"`)
    }
  })

  it("writes one fully-populated row", () => {
    const [, line] = buildRetreatCsv([row()], EVENT_DATE).split("\r\n")
    expect(cells(line)).toEqual([
      "Juan Dela Cruz",
      "JD",
      "juan@ctj.test",
      "Youth",
      "Pre-registered",
      "2010-09-05",
      "15",
      "12 Shoe Ave, Marikina",
      "09171234567",
      "Maria Dela Cruz",
      "09181234567",
      "baby-1786166356633-ej1nor96lw.jpeg",
      "https://signed.test/baby.jpeg?token=abc",
      "2026-08-15 10:30:00",
      "",
    ])
  })

  it("labels a Core registrant Core while keeping their age bracket out of the label", () => {
    const line = buildRetreatCsv([row({ category: "ya", isCore: true })], EVENT_DATE).split("\r\n")[1]
    expect(cells(line)[3]).toBe("Core")
  })

  it("uses the attendance-screen wording for status", () => {
    const csv = buildRetreatCsv(
      [row({ status: "registered" }), row({ status: "attended", attendedAt: "2026-08-30T01:05:00Z" })],
      EVENT_DATE,
    ).split("\r\n")
    expect(cells(csv[1])[4]).toBe("Pre-registered")
    expect(cells(csv[2])[4]).toBe("Attended")
    expect(cells(csv[2])[14]).toBe("2026-08-30 09:05:00")
  })

  it("leaves blanks rather than 'null' for anything not supplied", () => {
    const line = buildRetreatCsv(
      [
        row({
          nickname: null,
          birthdate: null,
          address: null,
          contactNumber: null,
          guardianName: null,
          guardianContact: null,
          babyPhotoFile: null,
          babyPhotoLink: null,
        }),
      ],
      EVENT_DATE,
    ).split("\r\n")[1]
    const c = cells(line)
    expect(c[1]).toBe("") // Nickname
    expect(c[5]).toBe("") // Birthday
    expect(c[6]).toBe("") // Age
    expect(c[7]).toBe("") // Address
    expect(c[9]).toBe("") // Guardian Name
    expect(c[11]).toBe("") // Baby Photo File
    expect(line).not.toContain("null")
    expect(line).not.toContain("undefined")
  })

  it("keeps a filename in the export even when its signed link could not be minted", () => {
    const line = buildRetreatCsv([row({ babyPhotoLink: null })], EVENT_DATE).split("\r\n")[1]
    expect(cells(line)[11]).toBe("baby-1786166356633-ej1nor96lw.jpeg")
    expect(cells(line)[12]).toBe("")
  })

  it("keeps an address containing a comma in one cell", () => {
    const line = buildRetreatCsv([row({ address: "12 Shoe Ave, Marikina" })], EVENT_DATE).split("\r\n")[1]
    expect(cells(line)).toHaveLength(RETREAT_EXPORT_HEADERS.length)
  })

  it("uses CRLF line endings and emits one line per registrant", () => {
    const csv = buildRetreatCsv([row(), row(), row()], EVENT_DATE)
    expect(csv.split("\r\n")).toHaveLength(4)
  })

  it("returns a header-only file for an event with no registrations", () => {
    expect(buildRetreatCsv([], EVENT_DATE).split("\r\n")).toHaveLength(1)
  })
})

describe("exportFilename", () => {
  it("slugs the event name and stamps the date", () => {
    expect(exportFilename("CTJ Youth Retreat 2026", new Date("2026-08-15T02:00:00Z"))).toBe(
      "attendance-ctj-youth-retreat-2026-2026-08-15.csv",
    )
  })

  it("strips characters that would break the Content-Disposition header", () => {
    const name = exportFilename('Retreat "2026"; rm -rf /', new Date("2026-08-15T02:00:00Z"))
    expect(name).not.toMatch(/["/\\\r\n]/)
  })

  it("falls back to a generic name for an unnamed event", () => {
    expect(exportFilename("", new Date("2026-08-15T02:00:00Z"))).toBe(
      "attendance-export-2026-08-15.csv",
    )
  })
})
