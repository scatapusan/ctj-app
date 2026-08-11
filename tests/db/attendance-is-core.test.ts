import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  startTestDb,
  stopTestDb,
  loadBaseSchema,
  applyRolesAndGrants,
  applyMigrations,
  asRole,
  type TestDb,
} from "./harness"

// attendance.is_core — core is a ROLE, kept orthogonal to the age bracket in
// `category` so neither dimension is lost.
let db: TestDb
const EVENT = "00000000-0000-0000-0000-0000000000c0"

let coreMember: string
let plainMember: string

beforeAll(async () => {
  db = await startTestDb()
  await loadBaseSchema(db.client)
  await applyRolesAndGrants(db.client)
  await applyMigrations(db.client, [
    "20260626120000_register_and_checkin.sql",
    "20260626120100_rls_lockdown.sql",
    "20260807180000_retreat_preregistration.sql",
    "20260808060000_retreat_event_mode.sql",
    "20260808090000_private_photo_bucket.sql",
  ])

  await db.client.query(
    `insert into events (id, name, event_date, is_active) values ($1,'Synthetic Retreat','2026-08-30', true)`,
    [EVENT],
  )
  const core = await db.client.query(
    `insert into members (email, first_name, last_name, is_youth_ya_core)
     values ('core@x.test','Core','Leader',true) returning id`,
  )
  const plain = await db.client.query(
    `insert into members (email, first_name, last_name) values ('plain@x.test','Plain','Member') returning id`,
  )
  coreMember = core.rows[0].id
  plainMember = plain.rows[0].id

  // Rows that predate the column, one for each kind of member.
  await db.client.query(
    `insert into attendance (member_id, event_id, status, category) values
       ($1,$2,'registered','ya'),
       ($3,$2,'registered','youth')`,
    [coreMember, EVENT, plainMember],
  )

  await applyMigrations(db.client, ["20260808120000_attendance_is_core.sql"])
}, 90000)

afterAll(async () => {
  if (db) await stopTestDb(db)
})

const rowFor = async (memberId: string) =>
  (
    await db.client.query("select category, is_core from attendance where member_id=$1 and event_id=$2", [
      memberId,
      EVENT,
    ])
  ).rows[0]

describe("attendance.is_core", () => {
  it("backfills existing rows from the member's core flag", async () => {
    expect((await rowFor(coreMember)).is_core).toBe(true)
    expect((await rowFor(plainMember)).is_core).toBe(false)
  })

  it("keeps the age bracket intact — core does NOT overwrite category", async () => {
    // The whole point of the design: a core leader is still YA-aged.
    expect((await rowFor(coreMember)).category).toBe("ya")
    expect((await rowFor(plainMember)).category).toBe("youth")
  })

  it("defaults to false for new rows (the RPC path, where members are always new)", async () => {
    const m = await db.client.query(
      `insert into members (email, first_name, last_name) values ('fresh@x.test','Fresh','Face') returning id`,
    )
    await asRole(db.client, "service_role", () =>
      db.client.query("insert into attendance (member_id, event_id) values ($1,$2)", [m.rows[0].id, EVENT]),
    )
    const res = await db.client.query("select is_core from attendance where member_id=$1", [m.rows[0].id])
    expect(res.rows[0].is_core).toBe(false)
  })

  it("is a SNAPSHOT — revoking core later does not rewrite history", async () => {
    await db.client.query("update members set is_youth_ya_core = false where id=$1", [coreMember])
    // The person is no longer core, but they WERE core at this event.
    expect((await rowFor(coreMember)).is_core).toBe(true)
    // restore for any later assertions
    await db.client.query("update members set is_youth_ya_core = true where id=$1", [coreMember])
  })

  it("is idempotent — re-applying does not flip anyone", async () => {
    await db.client.query("update members set is_youth_ya_core = false where id=$1", [plainMember])
    await applyMigrations(db.client, ["20260808120000_attendance_is_core.sql"])
    expect((await rowFor(plainMember)).is_core).toBe(false)
    expect((await rowFor(coreMember)).is_core).toBe(true)
  })

  it("counts by age bracket still include core leaders", async () => {
    // Regression guard for the reason we did NOT put 'core' in the enum.
    const res = await db.client.query(
      "select count(*)::int n from attendance where event_id=$1 and category='ya'",
      [EVENT],
    )
    expect(res.rows[0].n).toBeGreaterThanOrEqual(1)
  })
})
