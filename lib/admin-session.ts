import crypto from "crypto"
import { cookies } from "next/headers"

export const SESSION_COOKIE = "ctj_admin"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14 // 14 days

export type AdminRole = "admin" | "core"

export interface AdminSession {
  memberId: string
  email: string
  role: AdminRole
  /** Issued-at, seconds since epoch */
  iat: number
}

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set. Generate one with `openssl rand -hex 32` and add it to your environment."
    )
  }
  return secret
}

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
  const padLen = (4 - (padded.length % 4)) % 4
  return Buffer.from(padded + "=".repeat(padLen), "base64")
}

function sign(payload: string, secret: string): string {
  return b64urlEncode(crypto.createHmac("sha256", secret).update(payload).digest())
}

/** Encode a session into a signed cookie value: `<base64url(payload)>.<base64url(hmac)>` */
export function encodeSession(session: AdminSession): string {
  const payload = b64urlEncode(JSON.stringify(session))
  const sig = sign(payload, getSecret())
  return `${payload}.${sig}`
}

/** Verify a cookie value and return the session if valid, else null. */
export function decodeSession(token: string | undefined): AdminSession | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payload, sig] = parts

  let secret: string
  try {
    secret = getSecret()
  } catch {
    return null
  }

  const expected = sign(payload, secret)
  // Constant-time compare
  if (
    expected.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return null
  }

  try {
    const session = JSON.parse(b64urlDecode(payload).toString("utf8")) as AdminSession
    if (
      typeof session.memberId !== "string" ||
      typeof session.email !== "string" ||
      (session.role !== "admin" && session.role !== "core") ||
      typeof session.iat !== "number"
    ) {
      return null
    }
    // TTL check
    const now = Math.floor(Date.now() / 1000)
    if (now - session.iat > SESSION_TTL_SECONDS) return null
    return session
  } catch {
    return null
  }
}

/** Read the current session from request cookies (server components / route handlers). */
export function readSession(): AdminSession | null {
  return decodeSession(cookies().get(SESSION_COOKIE)?.value)
}

/** Cookie attributes used when issuing a session cookie. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  }
}
