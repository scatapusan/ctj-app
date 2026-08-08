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

// Real PostgreSQL test (Docker-free, synthetic data only) for the retreat
// pre-registration migration: attendance.status/attended_at/retreat columns
// and the widened register_and_checkin signature. The critical property is
// BACKWARD COMPATIBILITY — the legacy 2-arg RPC call and plain attendance
// inserts must behave exactly as before the migration.
let db: TestDb
const EVENT = "00000000-0000-0000-0000-0000000000e2"

beforeAll(async () => {
  db = await startTestDb()
  await loadBaseSchema(db.client)
  await applyRolesAndGrants(db.client)
  await applyMigrations(db.client, [
    "20260626120000_register_and_checkin.sql",
    "20260626120100_rls_lockdown.sql",
    "20260807180000_retreat_preregistration.sql",
  ])
  await db.client.query(
    `insert into events (id, name, event_date, is_active) values ($1,'Synthetic Retreat','2026-08-30', true)`,
    [EVENT],
  )
}, 90000)

afterAll(async () => {
  if (db) await stopTestDb(db)
})

function rpcLegacy(member: Record<string, unknown>) {
  return asRole(db.client, "service_role", () =>
    db.client.query("select * from register_and_checkin($1::jsonb, $2::uuid)", [JSON.stringify(member), EVENT]),
  )
}

function rpcRetreat(member: Record<string, unknown>, status: string, retreat: Record<string, unknown> | null) {
  return asRole(db.client, "service_role", () =>
    db.client.query("select * from register_and_checkin($1::jsonb, $2::uuid, $3, $4::jsonb)", [
      JSON.stringify(member),
      EVENT,
      status,
      retreat ? JSON.stringify(retreat) : null,
    ]),
  )
}

async function attendanceOf(memberId: string) {
  const res = await db.client.query(
    "select status, attended_at, checked_in_at, category, baby_photo_url, guardian_name, guardian_contact from attendance where member_id=$1 and event_id=$2",
    [memberId, EVENT],
  )
  return res.rows[0]
}

describe("retreat migration — backward compatibility", () => {
  it("legacy 2-arg RPC call still checks in as 'attended' (old behavior byte-for-byte)", async () => {
    const res = await rpcLegacy({ email: "legacy@x.test", first_name: "Legacy", last_name: "Caller" })
    const att = await attendanceOf(res.rows[0].id)
    expect(att.status).toBe("attended")
    expect(att.attended_at).not.toBeNull()
    expect(att.category).toBeNull()
  })

  it("plain attendance INSERT (the check-in route's path) defaults to 'attended'", async () => {
    const m = await rpcLegacy({ email: "plain@x.test", first_name: "Plain", last_name: "Insert" })
    const other = "00000000-0000-0000-0000-0000000000e3"
    await db.client.query(`insert into events (id, name, event_date, is_active) values ($1,'Other','2026-08-08', true)`, [other])
    await asRole(db.client, "service_role", () =>
      db.client.query("insert into attendance (member_id, event_id) values ($1, $2)", [m.rows[0].id, other]),
    )
    const res = await db.client.query("select status from attendance where member_id=$1 and event_id=$2", [m.rows[0].id, other])
    expect(res.rows[0].status).toBe("attended")
  })

  it("re-applying the migration is safe and backfills attended_at on attended rows", async () => {
    // The plain-insert row above has attended_at null (its attended time is
    // checked_in_at) — re-running the migration must backfill it and change
    // nothing else. This mirrors rows that existed before the first apply.
    await applyMigrations(db.client, ["20260807180000_retreat_preregistration.sql"])
    const res = await db.client.query(
      "select count(*)::int n from attendance where status='attended' and attended_at is null",
    )
    expect(res.rows[0].n).toBe(0)
  })
})

describe("retreat migration — pre-registration path", () => {
  it("status='registered' stores retreat fields and leaves attended_at null", async () => {
    const res = await rpcRetreat(
      { email: "prereg@x.test", first_name: "Pre", last_name: "Reg", birthdate: "2010-01-15" },
      "registered",
      { category: "youth", guardian_name: "Guardian Name", guardian_contact: "0917 111 2222" },
    )
    const att = await attendanceOf(res.rows[0].id)
    expect(att.status).toBe("registered")
    expect(att.attended_at).toBeNull()
    expect(att.category).toBe("youth")
    expect(att.guardian_name).toBe("Guardian Name")
    expect(att.guardian_contact).toBe("0917 111 2222")
  })

  it("stores the YA baby photo URL", async () => {
    const res = await rpcRetreat(
      { email: "ya@x.test", first_name: "Young", last_name: "Adult", birthdate: "1999-04-22" },
      "registered",
      { category: "ya", baby_photo_url: "https://example.com/baby.jpg" },
    )
    const att = await attendanceOf(res.rows[0].id)
    expect(att.category).toBe("ya")
    expect(att.baby_photo_url).toBe("https://example.com/baby.jpg")
  })

  it("rejects an invalid status", async () => {
    await expect(
      rpcRetreat({ email: "bad@x.test", first_name: "Bad", last_name: "Status" }, "vip", null),
    ).rejects.toThrow(/invalid status/)
  })

  it("rejects an invalid category via the CHECK constraint", async () => {
    await expect(
      rpcRetreat({ email: "badcat@x.test", first_name: "Bad", last_name: "Cat" }, "registered", { category: "elder" }),
    ).rejects.toThrow()
  })

  it("still NEVER lets the caller set privilege flags", async () => {
    const res = await rpcRetreat(
      { email: "priv@x.test", first_name: "Priv", last_name: "Esc", is_admin: true, is_youth_ya_core: true },
      "registered",
      { category: "youth" },
    )
    expect(res.rows[0].is_admin).toBe(false)
    expect(res.rows[0].is_youth_ya_core).toBe(false)
  })

  it("marking one pre-registered row attended NEVER disturbs any other row", async () => {
    // Two fresh pre-registrations + the earlier legacy check-ins already in
    // the table. Mark ONE attended using the exact UPDATE the admin route
    // issues, then prove every other row is byte-identical.
    const a = await rpcRetreat(
      { email: "mark-a@x.test", first_name: "Mark", last_name: "Able", birthdate: "2005-02-02" },
      "registered",
      { category: "youth" },
    )
    const b = await rpcRetreat(
      { email: "mark-b@x.test", first_name: "Mark", last_name: "Baker", birthdate: "2004-03-03" },
      "registered",
      { category: "youth" },
    )

    const before = await db.client.query("select * from attendance order by id")
    const targetRes = await db.client.query(
      "select id from attendance where member_id=$1 and event_id=$2",
      [a.rows[0].id, EVENT],
    )
    const targetId = targetRes.rows[0].id

    await asRole(db.client, "service_role", () =>
      db.client.query(
        "update attendance set status='attended', attended_at=now() where id=$1 and status='registered'",
        [targetId],
      ),
    )

    const after = await db.client.query("select * from attendance order by id")
    expect(after.rows.length).toBe(before.rows.length)
    for (let i = 0; i < before.rows.length; i++) {
      if (before.rows[i].id === targetId) {
        expect(after.rows[i].status).toBe("attended")
        expect(after.rows[i].attended_at).not.toBeNull()
        // Everything else on the target row is untouched too.
        const { status: _s1, attended_at: _a1, ...restBefore } = before.rows[i]
        const { status: _s2, attended_at: _a2, ...restAfter } = after.rows[i]
        expect(restAfter).toEqual(restBefore)
      } else {
        expect(after.rows[i]).toEqual(before.rows[i])
      }
    }

    // The other pre-registration is specifically still 'registered'.
    const other = await db.client.query(
      "select status, attended_at from attendance where member_id=$1 and event_id=$2",
      [b.rows[0].id, EVENT],
    )
    expect(other.rows[0].status).toBe("registered")
    expect(other.rows[0].attended_at).toBeNull()
  })

  it("a second registration for the same member+event violates the unique constraint (23505)", async () => {
    const res = await rpcLegacy({ email: "dupe@x.test", first_name: "Du", last_name: "Pe" })
    await expect(
      asRole(db.client, "service_role", () =>
        db.client.query("insert into attendance (member_id, event_id, status) values ($1, $2, 'registered')", [
          res.rows[0].id,
          EVENT,
        ]),
      ),
    ).rejects.toMatchObject({ code: "23505" })
  })
})
