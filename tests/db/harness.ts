import EmbeddedPostgres from "embedded-postgres"
import { Client } from "pg"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import os from "node:os"

const ROOT = process.cwd()

export interface TestDb {
  pg: EmbeddedPostgres
  client: Client
  port: number
}

/**
 * Boot a throwaway embedded PostgreSQL (no Docker) for DB-level tests.
 * Each call uses a unique port + data dir so files can run in parallel.
 * NOTE: local PG version may differ from prod (Supabase PG17); RLS / policy /
 * grant semantics are identical across these versions.
 */
export async function startTestDb(): Promise<TestDb> {
  const port = 54100 + Math.floor(Math.random() * 3000)
  const databaseDir = join(os.tmpdir(), `ctj-pgtest-${port}-${Date.now()}`)
  const pg = new EmbeddedPostgres({ databaseDir, user: "postgres", password: "postgres", port, persistent: false })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase("ctjtest")
  const client = new Client({ host: "127.0.0.1", port, user: "postgres", password: "postgres", database: "ctjtest" })
  await client.connect()
  return { pg, client, port }
}

export async function stopTestDb(db: TestDb): Promise<void> {
  try { await db.client.end() } catch { /* ignore */ }
  try { await db.pg.stop() } catch { /* ignore */ }
}

/** Load the production schema snapshot (tables, constraints, functions, RLS policies). */
export async function loadBaseSchema(client: Client): Promise<void> {
  const sql = readFileSync(join(ROOT, "supabase", "schema-snapshot.sql"), "utf8")
  await client.query(sql)
}

/** Create the Supabase roles + prod-matching grants so anon/service_role behave like production. */
export async function applyRolesAndGrants(client: Client): Promise<void> {
  await client.query(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
  `)
  await client.query(`grant usage on schema public to anon, authenticated, service_role;`)
  await client.query(`grant select, insert, update on public.members to anon, authenticated;`)
  await client.query(`grant select, insert on public.attendance to anon, authenticated;`)
  await client.query(`grant select on public.events to anon, authenticated;`)
  await client.query(`grant all on all tables in schema public to service_role;`)
  await client.query(`grant execute on function public.verify_pin(uuid, text) to anon, authenticated, service_role;`)
}

/** Apply repo migrations (in the given order) to the test DB. */
export async function applyMigrations(client: Client, files: string[]): Promise<void> {
  for (const f of files) {
    const sql = readFileSync(join(ROOT, "supabase", "migrations", f), "utf8")
    await client.query(sql)
  }
}

/** Run a callback with the connection switched to a given role (anon/service_role), then reset. */
export async function asRole<T>(client: Client, role: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`set role ${role}`)
  try {
    return await fn()
  } finally {
    await client.query("reset role")
  }
}
