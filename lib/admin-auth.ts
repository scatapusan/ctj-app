import { NextResponse } from "next/server"
import { redirect } from "next/navigation"
import { readSession, type AdminRole, type AdminSession } from "@/lib/admin-session"

export type RoleGuard = { ok: true; session: AdminSession } | { ok: false; response: NextResponse }

/**
 * Reuses the readSession() + role gate (same mechanism as
 * app/api/admin/invite/route.ts). Returns 403 for BOTH no-session and
 * wrong-role, matching the /api/sheets/* routes and the Batch 2b test spec.
 */
export function requireRole(...allowed: AdminRole[]): RoleGuard {
  const session = readSession()
  if (!session || !allowed.includes(session.role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true, session }
}

/**
 * Page-level guard for the admin (dashboard) server layout. Runs in the Node.js
 * runtime, where the Node-crypto session verify works — unlike Edge middleware,
 * which 500s on `crypto.createHmac`. Redirects unauthenticated visitors to the
 * login page; returns the session for callers that want it.
 */
export function requireAdminPage(): AdminSession {
  const session = readSession()
  if (!session) {
    redirect("/admin/login")
  }
  return session
}
