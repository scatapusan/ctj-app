import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

// Regression guard for the Edge-runtime crypto bug: middleware runs in the Edge
// runtime, which does NOT support Node's crypto. So no Edge entrypoint may import
// node:crypto — directly or transitively via lib/admin-session (which does).
describe("Edge runtime safety", () => {
  it("no Edge middleware pulls in Node crypto (directly or via admin-session)", () => {
    const mw = join(process.cwd(), "middleware.ts")
    if (!existsSync(mw)) {
      // No middleware => no Edge entrypoint => no Node-crypto-in-Edge risk.
      expect(existsSync(mw)).toBe(false)
      return
    }
    const src = readFileSync(mw, "utf8")
    expect(src).not.toMatch(/from\s+["']node:crypto["']/)
    expect(src).not.toMatch(/from\s+["']crypto["']/)
    expect(src).not.toMatch(/@\/lib\/admin-session/)
  })
})
