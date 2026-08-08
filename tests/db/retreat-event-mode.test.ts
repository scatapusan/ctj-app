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

// Real PostgreSQL test (Docker-free, synthetic data only) for the fix to the
// bug found in production on 2026-08-08: the retreat event was selectable in
// the ordinary /attend picker, so checking into it wrote status='attended'
// three weeks early with no retreat data — and ordinary check-ins were landing
// as 'attended' with attended_at null.
let db: TestDb
const CHECKIN_EVENT = "00000000-0000-0000-0000-0000000000f1"
const RETREAT_EVENT = "00000000-0000-0000-0000-0000000000f2"

beforeAll(async () => {
  db = await startTestDb()
  await loadBaseSchema(db.client)
  await applyRolesAndGrants(db.client)
  await applyMigrations(db.client, [
    "20260626120000_register_and_checkin.sql",
    "20260626120100_rls_lockdown.sql",
    "20260807180000_retreat_preregistration.sql",
  ])

  // Rows that exist BEFORE the new migration: an ordinary check-in written by
  // the live app, which lands 'attended' with attended_at null.
  await db.client.query(
    `insert into events (id, name, event_date, is_active) values
       ($1,'Synthetic Fellowship','2026-08-08', true),
       ($2,'Synthetic Retreat','2026-08-30', true)`,
    [CHECKIN_EVENT, RETREAT_EVENT],
  )
  await db.client.query(
    `insert into members (email, first_name, last_name) values ('legacy@x.test','Legacy','Row') returning id`,
  )
  const m = await db.client.query(`select id from members where email='legacy@x.test'`)
  await db.client.query(
    `insert into attendance (member_id, event_id, status, attended_at) values ($1,$2,'attended', null)`,
    [m.rows[0].id, CHECKIN_EVENT],
  )

  await applyMigrations(db.client, ["20260808060000_retreat_event_mode.sql"])
}, 90000)

afterAll(async () => {
  if (db) await stopTestDb(db)
})

async function newMember(email: string): Promise<string> {
  const res = await db.client.query(
    `insert into members (email, first_name, last_name) values ($1,'Test','Person') returning id`,
    [email],
  )
  return res.rows[0].id
}

describe("events.registration_mode", () => {
  it("defaults existing and new events to 'checkin' (old behavior preserved)", async () => {
    const res = await db.client.query("select registration_mode from events where id=$1", [CHECKIN_EVENT])
    expect(res.rows[0].registration_mode).toBe("checkin")
  })

  it("rejects an unknown mode", async () => {
    await expect(
      db.client.query("update events set registration_mode='party' where id=$1", [CHECKIN_EVENT]),
    ).rejects.toThrow()
  })

  it("anon can read registration_mode (needed by the public event picker)", async () => {
    await db.client.query("update events set registration_mode='retreat' where id=$1", [RETREAT_EVENT])
    const res = await asRole(db.client, "anon", () =>
      db.client.query("select id, registration_mode from events where is_active = true and registration_mode = 'checkin'"),
    )
    const ids = res.rows.map((r) => r.id)
    expect(ids).toContain(CHECKIN_EVENT)
    // The whole point: the retreat never reaches the ordinary picker.
    expect(ids).not.toContain(RETREAT_EVENT)
  })
})

describe("attended_at invariant", () => {
  it("backfilled the pre-existing 'attended' row that had a null attended_at", async () => {
    const res = await db.client.query(
      "select count(*)::int n from attendance where status='attended' and attended_at is null",
    )
    expect(res.rows[0].n).toBe(0)
  })

  it("stamps attended_at on a plain check-in INSERT (the live /attend path)", async () => {
    const id = await newMember("plain-insert@x.test")
    await asRole(db.client, "service_role", () =>
      db.client.query("insert into attendance (member_id, event_id) values ($1,$2)", [id, CHECKIN_EVENT]),
    )
    const res = await db.client.query("select status, attended_at from attendance where member_id=$1", [id])
    expect(res.rows[0].status).toBe("attended")
    expect(res.rows[0].attended_at).not.toBeNull()
  })

  it("leaves attended_at null for a pre-registration", async () => {
    const id = await newMember("prereg-mode@x.test")
    await asRole(db.client, "service_role", () =>
      db.client.query(
        "insert into attendance (member_id, event_id, status, attended_at) values ($1,$2,'registered', null)",
        [id, RETREAT_EVENT],
      ),
    )
    const res = await db.client.query("select status, attended_at from attendance where member_id=$1", [id])
    expect(res.rows[0].status).toBe("registered")
    expect(res.rows[0].attended_at).toBeNull()
  })

  it("stamps attended_at at MARK time, not registration time, when staff mark someone", async () => {
    const id = await newMember("marked@x.test")
    await asRole(db.client, "service_role", () =>
      db.client.query(
        "insert into attendance (member_id, event_id, status, attended_at, checked_in_at) values ($1,$2,'registered', null, now() - interval '10 days')",
        [id, RETREAT_EVENT],
      ),
    )
    // The admin route updates status only in the worst case; the trigger must
    // still not backdate attendance to the registration moment.
    await asRole(db.client, "service_role", () =>
      db.client.query("update attendance set status='attended' where member_id=$1", [id]),
    )
    const res = await db.client.query(
      "select attended_at, checked_in_at, attended_at - checked_in_at as gap from attendance where member_id=$1",
      [id],
    )
    expect(res.rows[0].attended_at).not.toBeNull()
    // ~10 days after the pre-registration, i.e. "now", not checked_in_at.
    expect(res.rows[0].gap.days).toBeGreaterThanOrEqual(9)
  })

  it("clears attended_at if a row is ever moved back to 'registered'", async () => {
    const id = await newMember("reverted@x.test")
    await asRole(db.client, "service_role", () =>
      db.client.query("insert into attendance (member_id, event_id) values ($1,$2)", [id, CHECKIN_EVENT]),
    )
    await asRole(db.client, "service_role", () =>
      db.client.query("update attendance set status='registered' where member_id=$1", [id]),
    )
    const res = await db.client.query("select attended_at from attendance where member_id=$1", [id])
    expect(res.rows[0].attended_at).toBeNull()
  })

  it("register_and_checkin still works through the trigger for both statuses", async () => {
    const attended = await asRole(db.client, "service_role", () =>
      db.client.query("select * from register_and_checkin($1::jsonb, $2::uuid)", [
        JSON.stringify({ email: "rpc-attended@x.test", first_name: "R", last_name: "A" }),
        CHECKIN_EVENT,
      ]),
    )
    const a = await db.client.query("select status, attended_at from attendance where member_id=$1", [
      attended.rows[0].id,
    ])
    expect(a.rows[0].status).toBe("attended")
    expect(a.rows[0].attended_at).not.toBeNull()

    const registered = await asRole(db.client, "service_role", () =>
      db.client.query("select * from register_and_checkin($1::jsonb, $2::uuid, $3, $4::jsonb)", [
        JSON.stringify({ email: "rpc-registered@x.test", first_name: "R", last_name: "R" }),
        RETREAT_EVENT,
        "registered",
        JSON.stringify({ category: "youth" }),
      ]),
    )
    const r = await db.client.query("select status, attended_at from attendance where member_id=$1", [
      registered.rows[0].id,
    ])
    expect(r.rows[0].status).toBe("registered")
    expect(r.rows[0].attended_at).toBeNull()
  })
})
