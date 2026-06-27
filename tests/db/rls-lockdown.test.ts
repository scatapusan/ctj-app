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

// RED -> GREEN for the RLS lockdown migration, against a real Postgres
// (Docker-free, synthetic data). The first describe proves the CURRENT
// permissive policies are insecure; the second proves the lockdown migration
// closes every hole. Both run in one suite to demonstrate the transition.
let db: TestDb
const M1 = "00000000-0000-0000-0000-0000000000a1"
const M2 = "00000000-0000-0000-0000-0000000000a2"
const ACTIVE = "00000000-0000-0000-0000-0000000000e1"
const INACTIVE = "00000000-0000-0000-0000-0000000000e2"

beforeAll(async () => {
  db = await startTestDb()
  await loadBaseSchema(db.client)
  await applyRolesAndGrants(db.client)
  await db.client.query(`
    insert into events (id, name, description, event_date, is_active) values
      ('${ACTIVE}','Active Event','secret note','2026-06-21', true),
      ('${INACTIVE}','Inactive Event','secret note','2026-01-01', false);
    insert into members (id, email, first_name, last_name, pin) values
      ('${M1}','a1@x.test','Aa','Bb','1234'),
      ('${M2}','a2@x.test','Cc','Dd','4321');
    insert into attendance (member_id, event_id) values ('${M1}','${ACTIVE}');
  `)
}, 90000)

afterAll(async () => {
  if (db) await stopTestDb(db)
})

describe("RED — current permissive policies are insecure", () => {
  it("anon CAN read every member (incl. the pin column)", async () => {
    const r = await asRole(db.client, "anon", () =>
      db.client.query("select count(*)::int n, bool_or(pin is not null) can_read_pin from members"),
    )
    expect(r.rows[0].n).toBe(2)
    expect(r.rows[0].can_read_pin).toBe(true)
  })

  it("anon CAN update any member (e.g. rewrite a PIN / self-promote)", async () => {
    const r = await asRole(db.client, "anon", () =>
      db.client.query("update members set pin='9999' where id=$1", [M1]),
    )
    expect(r.rowCount).toBe(1)
  })
})

describe("GREEN — after the lockdown migration", () => {
  beforeAll(async () => {
    await applyMigrations(db.client, ["20260626120100_rls_lockdown.sql"])
  })

  it("blocks anon SELECT on members", async () => {
    await expect(asRole(db.client, "anon", () => db.client.query("select * from members"))).rejects.toThrow()
  })

  it("blocks anon UPDATE on members", async () => {
    await expect(asRole(db.client, "anon", () => db.client.query("update members set pin='0000' where id=$1", [M1]))).rejects.toThrow()
  })

  it("blocks anon DELETE on members", async () => {
    await expect(asRole(db.client, "anon", () => db.client.query("delete from members where id=$1", [M2]))).rejects.toThrow()
  })

  it("blocks anon SELECT on attendance", async () => {
    await expect(asRole(db.client, "anon", () => db.client.query("select * from attendance"))).rejects.toThrow()
  })

  it("lets anon read only ACTIVE events, safe columns only", async () => {
    const r = await asRole(db.client, "anon", () => db.client.query("select id, name, event_date from events"))
    expect(r.rows.length).toBe(1) // inactive event hidden by the policy
    expect(r.rows[0].id).toBe(ACTIVE)
  })

  it("blocks anon from reading the events.description column", async () => {
    await expect(asRole(db.client, "anon", () => db.client.query("select description from events"))).rejects.toThrow()
  })

  it("blocks anon from executing verify_pin", async () => {
    await expect(asRole(db.client, "anon", () => db.client.query("select verify_pin($1::uuid,'1234')", [M1]))).rejects.toThrow()
  })

  it("still lets the service role read members (routes keep working)", async () => {
    const r = await asRole(db.client, "service_role", () => db.client.query("select count(*)::int n from members"))
    expect(r.rows[0].n).toBe(2)
  })
})
