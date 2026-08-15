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

// 20260814150000: Core becomes SELF-SELECTED on the retreat form. The widened
// register_and_checkin carries p_retreat.is_core onto the attendance row. The
// non-negotiable property: that choice is attendance data only — it can never
// set is_youth_ya_core or is_admin on the member record.
let db: TestDb
const EVENT = "00000000-0000-0000-0000-0000000000c5"

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
    "20260808120000_attendance_is_core.sql",
    "20260814150000_core_self_select_rpc.sql",
  ])
  await db.client.query(
    `insert into events (id, name, event_date, is_active) values ($1,'Synthetic Retreat','2026-08-30', true)`,
    [EVENT],
  )
}, 90000)

afterAll(async () => {
  if (db) await stopTestDb(db)
})

function rpcRetreat(member: Record<string, unknown>, retreat: Record<string, unknown> | null) {
  return asRole(db.client, "service_role", () =>
    db.client.query("select * from register_and_checkin($1::jsonb, $2::uuid, 'registered', $3::jsonb)", [
      JSON.stringify(member),
      EVENT,
      retreat ? JSON.stringify(retreat) : null,
    ]),
  )
}

async function attendanceOf(memberId: string) {
  const res = await db.client.query(
    "select status, category, is_core from attendance where member_id=$1 and event_id=$2",
    [memberId, EVENT],
  )
  return res.rows[0]
}

describe("register_and_checkin — self-selected core", () => {
  it("stores is_core=true on the attendance row when the registrant chose Core", async () => {
    const res = await rpcRetreat(
      { email: "chose-core@x.test", first_name: "Chose", last_name: "Core", birthdate: "1999-04-22" },
      { category: "ya", is_core: true },
    )
    const att = await attendanceOf(res.rows[0].id)
    expect(att.is_core).toBe(true)
    // The age bracket survives alongside the label.
    expect(att.category).toBe("ya")
  })

  it("defaults to false when the choice is absent (old clients, legacy calls)", async () => {
    const res = await rpcRetreat(
      { email: "no-choice@x.test", first_name: "No", last_name: "Choice", birthdate: "2008-01-01" },
      { category: "youth", guardian_name: "G", guardian_contact: "0917" },
    )
    expect((await attendanceOf(res.rows[0].id)).is_core).toBe(false)
  })

  it("stores is_core=false for an explicit non-core choice", async () => {
    const res = await rpcRetreat(
      { email: "explicit-no@x.test", first_name: "Explicit", last_name: "No", birthdate: "1998-02-02" },
      { category: "ya", is_core: false, baby_photo_url: "https://x.test/b.jpg" },
    )
    expect((await attendanceOf(res.rows[0].id)).is_core).toBe(false)
  })

  it("PRIVILEGE BOUNDARY: choosing core NEVER sets member flags, even with a hostile payload", async () => {
    const res = await rpcRetreat(
      {
        email: "hostile@x.test", first_name: "Hostile", last_name: "Payload", birthdate: "1997-03-03",
        is_admin: true, is_youth_ya_core: true, // must be ignored (kept from the old tests)
      },
      { category: "ya", is_core: true },
    )
    const m = res.rows[0]
    expect(m.is_admin).toBe(false)
    expect(m.is_youth_ya_core).toBe(false)
    // The self-declared label landed on attendance — and ONLY on attendance.
    expect((await attendanceOf(m.id)).is_core).toBe(true)
    const fresh = await db.client.query("select is_admin, is_youth_ya_core from members where id=$1", [m.id])
    expect(fresh.rows[0]).toEqual({ is_admin: false, is_youth_ya_core: false })
  })

  it("legacy 2-arg call still works and defaults is_core to false", async () => {
    const res = await asRole(db.client, "service_role", () =>
      db.client.query("select * from register_and_checkin($1::jsonb, $2::uuid)", [
        JSON.stringify({ email: "legacy2@x.test", first_name: "Legacy", last_name: "Two" }),
        EVENT,
      ]),
    )
    const att = await attendanceOf(res.rows[0].id)
    expect(att.status).toBe("attended")
    expect(att.is_core).toBe(false)
  })

  it("anon still cannot execute the RPC", async () => {
    await expect(
      asRole(db.client, "anon", () =>
        db.client.query(
          `select register_and_checkin('{"email":"anon@x.test","first_name":"a","last_name":"b"}'::jsonb, $1::uuid, 'registered', '{"is_core":true}'::jsonb)`,
          [EVENT],
        ),
      ),
    ).rejects.toThrow()
  })

  it("re-applying the migration is safe (create or replace, grants intact)", async () => {
    await applyMigrations(db.client, ["20260814150000_core_self_select_rpc.sql"])
    const res = await rpcRetreat(
      { email: "reapply@x.test", first_name: "Re", last_name: "Apply", birthdate: "1996-05-05" },
      { category: "ya", is_core: true },
    )
    expect((await attendanceOf(res.rows[0].id)).is_core).toBe(true)
  })
})
