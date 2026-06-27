// Best-effort, in-memory fixed-window rate limiter. NOTE: serverless instances
// are ephemeral and not shared, so this is per-instance only — it blunts casual
// hammering/enumeration but is NOT a hard guarantee. Batch 3 replaces this with
// a durable, cross-instance store + proper PIN lockout.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()

  // Opportunistic prune so the map can't grow without bound on a long-lived instance.
  if (buckets.size > 5000) {
    buckets.forEach((b, k) => {
      if (now > b.resetAt) buckets.delete(k)
    })
  }

  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }

  bucket.count++
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  return { ok: true, retryAfter: 0 }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]!.trim()
  return request.headers.get("x-real-ip") ?? "unknown"
}

/** Test-only: clear all buckets between cases. */
export function __resetRateLimit(): void {
  buckets.clear()
}
