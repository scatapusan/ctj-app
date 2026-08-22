import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/supabase-server", () => ({ createRouteHandlerClient: vi.fn() }))

import { createRouteHandlerClient } from "@/lib/supabase-server"
import { POST as uploadPOST } from "@/app/api/photos/upload/route"
import { __resetRateLimit } from "@/lib/rate-limit"
import {
  toStoredPhotoValue,
  toUploadedPhotoPath,
  isLegacyAbsoluteUrl,
  generatePhotoPath,
  signPhoto,
  signPhotos,
} from "@/lib/photos"

interface StorageCfg {
  uploadError?: unknown
  signedUrl?: string
  signError?: unknown
  batch?: { path: string; signedUrl: string }[]
  onUpload?: (path: string, file: unknown, opts: unknown) => void
}

function makeClient(cfg: StorageCfg = {}) {
  return {
    storage: {
      from: () => ({
        upload: async (path: string, file: unknown, opts: unknown) => {
          cfg.onUpload?.(path, file, opts)
          return { error: cfg.uploadError ?? null }
        },
        createSignedUrl: async () =>
          cfg.signError
            ? { data: null, error: cfg.signError }
            : { data: { signedUrl: cfg.signedUrl ?? "https://x.test/signed?token=abc" }, error: null },
        createSignedUrls: async () => ({ data: cfg.batch ?? [], error: null }),
      }),
    },
  }
}

const use = (cfg: StorageCfg = {}) =>
  vi.mocked(createRouteHandlerClient).mockReturnValue(makeClient(cfg) as never)

let ip = 0
function uploadReq(file: File | null, kind = "profile", forcedIp?: string) {
  const form = new FormData()
  if (file) form.append("file", file)
  form.append("kind", kind)
  return new Request("http://localhost/api/photos/upload", {
    method: "POST",
    headers: { "x-forwarded-for": forcedIp ?? `10.1.0.${++ip}` },
    body: form,
  })
}

const jpg = (bytes = 100, type = "image/jpeg") =>
  new File([new Uint8Array(bytes)], "photo.jpg", { type })

beforeEach(() => {
  vi.clearAllMocks()
  __resetRateLimit()
})

describe("toStoredPhotoValue — never persist a signed URL", () => {
  it("collapses a signed URL back to the object path", () => {
    expect(
      toStoredPhotoValue(
        "https://abc.supabase.co/storage/v1/object/sign/member-photos/baby-123.jpeg?token=xyz",
      ),
    ).toBe("baby-123.jpeg")
  })

  it("collapses a legacy public URL back to the object path", () => {
    expect(
      toStoredPhotoValue("https://abc.supabase.co/storage/v1/object/public/member-photos/photo-9.png"),
    ).toBe("photo-9.png")
  })

  it("leaves a bare path untouched", () => {
    expect(toStoredPhotoValue("baby-123.jpeg")).toBe("baby-123.jpeg")
  })

  it("leaves an unrelated third-party URL untouched (Bubble imports)", () => {
    expect(toStoredPhotoValue("https://s3.amazonaws.com/bubble/x.png")).toBe(
      "https://s3.amazonaws.com/bubble/x.png",
    )
  })

  it("handles null", () => {
    expect(toStoredPhotoValue(null)).toBeNull()
  })
})

describe("toUploadedPhotoPath — a public caller can only name a real upload", () => {
  // attendance.baby_photo_url is written straight from the public retreat form.
  // toStoredPhotoValue deliberately passes an unrecognised URL through (member
  // photos really do hold Bubble URLs), which is exactly wrong for this one
  // column: the value is later rendered as an <img src> on an admin screen and
  // read server-side while building the photo archive.
  it("accepts a path our own upload route produced", () => {
    expect(toUploadedPhotoPath("baby-1786166356633-ej1nor96lw.jpeg")).toBe(
      "baby-1786166356633-ej1nor96lw.jpeg",
    )
    expect(toUploadedPhotoPath("photo-1.webp")).toBe("photo-1.webp")
  })

  it("collapses one of our own storage URLs back to its path", () => {
    expect(
      toUploadedPhotoPath(
        "https://abc.supabase.co/storage/v1/object/sign/member-photos/baby-123.jpeg?token=xyz",
      ),
    ).toBe("baby-123.jpeg")
  })

  it("rejects an address that would make the server fetch somewhere", () => {
    expect(toUploadedPhotoPath("http://169.254.169.254/latest/meta-data/")).toBeNull()
    expect(toUploadedPhotoPath("http://10.0.0.1/")).toBeNull()
    expect(toUploadedPhotoPath("https://tracker.test/pixel.gif")).toBeNull()
    expect(toUploadedPhotoPath("https://s3.amazonaws.com/bubble/x.png")).toBeNull()
  })

  it("rejects anything that could climb out of the bucket", () => {
    expect(toUploadedPhotoPath("../../etc/passwd")).toBeNull()
    expect(toUploadedPhotoPath("nested/baby-1.jpeg")).toBeNull()
    expect(toUploadedPhotoPath("/baby-1.jpeg")).toBeNull()
  })

  it("rejects junk, blanks and non-strings", () => {
    expect(toUploadedPhotoPath("")).toBeNull()
    expect(toUploadedPhotoPath(null)).toBeNull()
    expect(toUploadedPhotoPath(undefined)).toBeNull()
    expect(toUploadedPhotoPath(42)).toBeNull()
    expect(toUploadedPhotoPath({ toString: () => "baby-1.jpeg" })).toBeNull()
    expect(toUploadedPhotoPath("baby 1.jpeg")).toBeNull()
    expect(toUploadedPhotoPath("a".repeat(300))).toBeNull()
  })
})

describe("signPhoto", () => {
  it("signs a stored path", async () => {
    const c = makeClient({ signedUrl: "https://x.test/signed?token=t" })
    expect(await signPhoto(c as never, "baby-1.jpg")).toBe("https://x.test/signed?token=t")
  })

  it("passes a legacy absolute URL through unsigned (pre-migration rows)", async () => {
    const c = makeClient()
    const legacy = "https://abc.supabase.co/storage/v1/object/public/member-photos/old.png"
    expect(await signPhoto(c as never, legacy)).toBe(legacy)
  })

  it("returns null for no photo, and null (not a throw) when signing fails", async () => {
    expect(await signPhoto(makeClient() as never, null)).toBeNull()
    const c = makeClient({ signError: { message: "not found" } })
    expect(await signPhoto(c as never, "missing.jpg")).toBeNull()
  })

  it("isLegacyAbsoluteUrl distinguishes URLs from paths", () => {
    expect(isLegacyAbsoluteUrl("https://x/y.png")).toBe(true)
    expect(isLegacyAbsoluteUrl("baby-1.png")).toBe(false)
  })
})

describe("signPhotos (batch)", () => {
  it("maps stored paths to signed URLs and keeps legacy URLs as-is", async () => {
    const legacy = "https://abc.supabase.co/storage/v1/object/public/member-photos/old.png"
    const c = makeClient({ batch: [{ path: "a.jpg", signedUrl: "https://x.test/a?token=1" }] })
    const map = await signPhotos(c as never, ["a.jpg", legacy, null])
    expect(map.get("a.jpg")).toBe("https://x.test/a?token=1")
    expect(map.get(legacy)).toBe(legacy)
  })
})

describe("generatePhotoPath", () => {
  it("never uses the client filename and picks the extension from the MIME type", () => {
    expect(generatePhotoPath("baby", "image/png")).toMatch(/^baby-\d+-[a-z0-9]+\.png$/)
    expect(generatePhotoPath("profile", "image/jpeg")).toMatch(/^photo-\d+-[a-z0-9]+\.jpg$/)
  })
})

describe("POST /api/photos/upload", () => {
  it("uploads and returns a server-generated path, never a URL", async () => {
    let seenPath = ""
    use({ onUpload: (p) => { seenPath = p } })
    const res = await uploadPOST(uploadReq(jpg(), "baby"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.path).toBe(seenPath)
    expect(body.path).toMatch(/^baby-/)
    expect(body.path).not.toMatch(/^https?:/)
    expect(body.url).toBeUndefined()
  })

  it("rejects a non-image", async () => {
    use()
    const bad = new File([new Uint8Array(10)], "x.pdf", { type: "application/pdf" })
    const res = await uploadPOST(uploadReq(bad))
    expect(res.status).toBe(400)
  })

  it("rejects a file over 5MB", async () => {
    use()
    const res = await uploadPOST(uploadReq(jpg(5 * 1024 * 1024 + 1)))
    expect(res.status).toBe(413)
  })

  it("rejects an empty file and a missing file", async () => {
    use()
    expect((await uploadPOST(uploadReq(jpg(0)))).status).toBe(400)
    expect((await uploadPOST(uploadReq(null))).status).toBe(400)
  })

  it("returns 500 when storage rejects the upload", async () => {
    use({ uploadError: { message: "boom" } })
    const res = await uploadPOST(uploadReq(jpg()))
    expect(res.status).toBe(500)
  })

  it("rate-limits by IP", async () => {
    use()
    const sameIp = "10.5.5.5"
    for (let i = 0; i < 12; i++) await uploadPOST(uploadReq(jpg(), "profile", sameIp))
    const res = await uploadPOST(uploadReq(jpg(), "profile", sameIp))
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
  })
})
