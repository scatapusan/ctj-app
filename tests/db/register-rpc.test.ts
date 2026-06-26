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

// Real PostgreSQL test (Docker-free, synthetic data only) for the
// register_and_checkin RPC introduced in Batch 2a.
let db: TestDb
const EVENT = "00000000-0000-0000-0000-0000000000e1"

beforeAll(async () => {
  db = await startTestDb()
  await loadBaseSchema(db.client)
  await applyRolesAndGrants(db.client)
  await applyMigrations(db.client, ["20260626120000_register_and_checkin.sql"])
  await db.client.query(
    `insert into events (id, name, event_date, is_active) values ($1,'Synthetic Fellowship','2026-06-21', true)`,
    [EVENT],
  )
}, 90000)

afterAll(async () => {
  if (db) await stopTestDb(db)
})

/** Call the RPC as service_role (mirrors how the server route calls it). */
async function register(member: Record<string, unknown>, eventId: string = EVENT) {
  return asRole(db.client, "service_role", () =>
    db.client.query("select * from register_and_checkin($1::jsonb, $2::uuid)", [JSON.stringify(member), eventId]),
  )
}

describe("register_and_checkin RPC", () => {
  it("atomically creates the member and the attendance row", async () => {
    const res = await register({ email: "Atomic@X.test", first_name: " Juan ", last_name: "DelaCruz", pin: "1111" })
    const m = res.rows[0]
    expect(m.email).toBe("atomic@x.test") // normalized
    expect(m.first_name).toBe("Juan") // trimmed
    const att = await db.client.query("select count(*)::int n from attendance where member_id=$1 and event_id=$2", [m.id, EVENT])
    expect(att.rows[0].n).toBe(1)
  })

  it("NEVER lets the caller set privilege flags (is_admin / is_youth_ya_core)", async () => {
    const res = await register({
      email: "sneaky@x.test", first_name: "S", last_name: "Q",
      is_admin: true, is_youth_ya_core: true,
    })
    expect(res.rows[0].is_admin).toBe(false)
    expect(res.rows[0].is_youth_ya_core).toBe(false)
  })

  it("rolls back the member insert when attendance fails (no orphan member) — fixes S2", async () => {
    const before = await db.client.query("select count(*)::int n from members")
    const badEvent = "00000000-0000-0000-0000-0000000000ff" // FK violation
    await expect(register({ email: "rollback@x.test", first_name: "R", last_name: "B" }, badEvent)).rejects.toThrow()
    const after = await db.client.query("select count(*)::int n from members")
    expect(after.rows[0].n).toBe(before.rows[0].n)
    const orphan = await db.client.query("select count(*)::int n from members where email='rollback@x.test'")
    expect(orphan.rows[0].n).toBe(0)
  })

  it("rejects a duplicate email", async () => {
    await register({ email: "dup@x.test", first_name: "D", last_name: "P" })
    await expect(register({ email: "dup@x.test", first_name: "D2", last_name: "P2" })).rejects.toThrow()
  })

  it("defaults the PIN to 1234 when none is supplied", async () => {
    const res = await register({ email: "nopin@x.test", first_name: "N", last_name: "P" })
    expect(res.rows[0].pin).toBe("1234")
  })

  it("denies anon from executing the RPC directly", async () => {
    await expect(
      asRole(db.client, "anon", () =>
        db.client.query("select register_and_checkin('{\"email\":\"x@y.test\",\"first_name\":\"a\",\"last_name\":\"b\"}'::jsonb, $1::uuid)", [EVENT]),
      ),
    ).rejects.toThrow()
  })
})
