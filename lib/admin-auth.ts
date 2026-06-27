import { NextResponse } from "next/server"
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
