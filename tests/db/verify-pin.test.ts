import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { startTestDb, stopTestDb, loadBaseSchema, applyRolesAndGrants, asRole, type TestDb } from "./harness"

// Real-DB sanity for verify_pin — the function the profile / change-pin routes
// depend on. (Docker-free embedded Postgres, synthetic data.)
let db: TestDb
const MEMBER = "00000000-0000-0000-0000-0000000000a1"

beforeAll(async () => {
  db = await startTestDb()
  await loadBaseSchema(db.client)
  await applyRolesAndGrants(db.client)
  await db.client.query(
    `insert into members (id, email, first_name, last_name, pin) values ($1,'pin@x.test','Pin','Tester','4321')`,
    [MEMBER],
  )
}, 90000)

afterAll(async () => {
  if (db) await stopTestDb(db)
})

async function verify(pin: string) {
  return asRole(db.client, "service_role", async () => {
    const r = await db.client.query("select verify_pin($1::uuid, $2::text) as ok", [MEMBER, pin])
    return r.rows[0].ok as boolean
  })
}

describe("verify_pin", () => {
  it("returns true for the correct PIN", async () => {
    expect(await verify("4321")).toBe(true)
  })

  it("returns false for an incorrect PIN", async () => {
    expect(await verify("0000")).toBe(false)
  })

  it("returns false for an unknown member", async () => {
    const ok = await asRole(db.client, "service_role", async () => {
      const r = await db.client.query("select verify_pin('00000000-0000-0000-0000-0000000000ff'::uuid, '4321') as ok")
      return r.rows[0].ok as boolean
    })
    expect(ok).toBe(false)
  })
})
