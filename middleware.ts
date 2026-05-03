import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { decodeSession, SESSION_COOKIE } from "@/lib/admin-session"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect /admin routes (except /admin/login and the login API itself)
  if (
    !pathname.startsWith("/admin") ||
    pathname === "/admin/login" ||
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/me") ||
    pathname.startsWith("/api/admin/logout")
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = decodeSession(token)

  if (!session) {
    const loginUrl = new URL("/admin/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Both 'admin' and 'core' roles are allowed past middleware.
  // Per-action authorization (e.g., delete, invite) is enforced in the API handlers.
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
