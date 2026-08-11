import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  startTestDb,
  stopTestDb,
  loadBaseSchema,
  applyRolesAndGrants,
  applyMigrations,
  type TestDb,
} from "./harness"

// Batch 4 data migration: stored photo values become bucket-relative object
// paths instead of absolute public URLs. The storage-schema half of the
// migration is guarded and no-ops here (the local DB has no `storage` schema),
// which this suite also asserts so the guard cannot silently rot.
let db: TestDb
const EVENT = "00000000-0000-0000-0000-0000000000b4"

const PUBLIC_URL = "https://dsxpdagzseipktubyzwx.supabase.co/storage/v1/object/public/member-photos/baby-123.jpeg"
const SIGNED_URL = "https://dsxpdagzseipktubyzwx.supabase.co/storage/v1/object/sign/member-photos/photo-9.png?token=abc"
const FOREIGN_URL = "https://s3.amazonaws.com/appforest_uf/imported-from-bubble.png"

beforeAll(async () => {
  db = await startTestDb()
  await loadBaseSchema(db.client)
  await applyRolesAndGrants(db.client)
  await applyMigrations(db.client, [
    "20260626120000_register_and_checkin.sql",
    "20260626120100_rls_lockdown.sql",
    "20260807180000_retreat_preregistration.sql",
    "20260808060000_retreat_event_mode.sql",
  ])

  await db.client.query(
    `insert into events (id, name, event_date, is_active) values ($1,'Synthetic Retreat','2026-08-30', true)`,
    [EVENT],
  )
  await db.client.query(
    `insert into members (email, first_name, last_name, photo_url) values
       ('legacy-public@x.test','Legacy','Public',$1),
       ('legacy-signed@x.test','Legacy','Signed',$2),
       ('foreign@x.test','Foreign','Host',$3),
       ('nophoto@x.test','No','Photo',null)`,
    [PUBLIC_URL, SIGNED_URL, FOREIGN_URL],
  )
  const m = await db.client.query(`select id from members where email='legacy-public@x.test'`)
  await db.client.query(
    `insert into attendance (member_id, event_id, status, attended_at, baby_photo_url)
     values ($1,$2,'registered',null,$3)`,
    [m.rows[0].id, EVENT, PUBLIC_URL],
  )

  await applyMigrations(db.client, ["20260808090000_private_photo_bucket.sql"])
}, 90000)

afterAll(async () => {
  if (db) await stopTestDb(db)
})

const photoOf = async (email: string) =>
  (await db.client.query("select photo_url from members where email=$1", [email])).rows[0].photo_url

describe("stored photo values become object paths", () => {
  it("rewrites a legacy PUBLIC url to its object path", async () => {
    expect(await photoOf("legacy-public@x.test")).toBe("baby-123.jpeg")
  })

  it("rewrites a SIGNED url to its object path, dropping the token", async () => {
    expect(await photoOf("legacy-signed@x.test")).toBe("photo-9.png")
  })

  it("leaves a third-party host untouched (Bubble-imported photos still resolve)", async () => {
    expect(await photoOf("foreign@x.test")).toBe(FOREIGN_URL)
  })

  it("leaves NULL photos null", async () => {
    expect(await photoOf("nophoto@x.test")).toBeNull()
  })

  it("rewrites attendance.baby_photo_url the same way", async () => {
    const res = await db.client.query("select baby_photo_url from attendance where event_id=$1", [EVENT])
    expect(res.rows[0].baby_photo_url).toBe("baby-123.jpeg")
  })

  it("is idempotent — re-applying does not mangle already-converted paths", async () => {
    await applyMigrations(db.client, ["20260808090000_private_photo_bucket.sql"])
    expect(await photoOf("legacy-public@x.test")).toBe("baby-123.jpeg")
    expect(await photoOf("foreign@x.test")).toBe(FOREIGN_URL)
    expect(await photoOf("nophoto@x.test")).toBeNull()
  })

  it("the storage half is guarded and does not error where no storage schema exists", async () => {
    const res = await db.client.query(
      "select count(*)::int n from information_schema.tables where table_schema='storage'",
    )
    // Guard precondition: if this ever becomes non-zero locally, the guard in
    // the migration is what keeps this suite honest.
    expect(res.rows[0].n).toBe(0)
  })
})
