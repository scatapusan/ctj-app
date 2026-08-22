import { describe, it, expect } from "vitest"
import { crc32, dosDateTime, buildZip, zipStream, zipChunks, type ZipEntry } from "@/lib/zip"
import { readZip } from "../helpers/zip-reader"

/**
 * These tests read the produced archive back with tests/helpers/zip-reader.ts,
 * an INDEPENDENT parser that walks the central directory the way a real
 * extractor does and throws on anything inconsistent. The published CRC vectors
 * below anchor the one part both sides could otherwise agree on wrongly.
 */

const bytes = (text: string) => new TextEncoder().encode(text)

describe("crc32", () => {
  // Published CRC-32 (IEEE) vectors — independent of anything in this repo.
  it("matches the reference vectors", () => {
    expect(crc32(bytes(""))).toBe(0)
    expect(crc32(bytes("a"))).toBe(0xe8b7be43)
    expect(crc32(bytes("hello"))).toBe(0x3610a686)
    expect(crc32(bytes("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339)
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926)
  })

  it("returns an unsigned 32-bit value", () => {
    // 0xe8b7be43 is > 2^31, so a signed slip would surface as a negative here.
    expect(crc32(bytes("a"))).toBeGreaterThan(0)
    expect(crc32(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBeGreaterThanOrEqual(0)
  })
})

describe("dosDateTime", () => {
  it("encodes a date into the MS-DOS fields", () => {
    const { time, date } = dosDateTime(new Date(2026, 7, 30, 14, 35, 20))
    expect((date >> 9) + 1980).toBe(2026)
    expect((date >> 5) & 0x0f).toBe(8) // August
    expect(date & 0x1f).toBe(30)
    expect(time >> 11).toBe(14)
    expect((time >> 5) & 0x3f).toBe(35)
    expect((time & 0x1f) * 2).toBe(20) // two-second resolution
  })

  it("clamps dates before the 1980 DOS epoch instead of wrapping", () => {
    const { date } = dosDateTime(new Date(1971, 0, 1))
    expect((date >> 9) + 1980).toBe(1980)
  })

  it("falls back to the current date for an invalid date", () => {
    // A zeroed DOS field would also satisfy ">= 1980", so this pins the actual
    // fallback: today, which is what an extractor should show.
    const { date } = dosDateTime(new Date("not a date"))
    const now = new Date()
    expect((date >> 9) + 1980).toBe(now.getFullYear())
    expect((date >> 5) & 0x0f).toBe(now.getMonth() + 1)
    expect(date & 0x1f).toBe(now.getDate())
  })
})

describe("buildZip", () => {
  const MODIFIED = new Date(2026, 7, 30, 9, 0, 0)

  it("round-trips one entry's name and bytes", async () => {
    const payload = bytes("baby photo bytes")
    const archive = await buildZip([{ name: "Juan Dela Cruz.jpg", data: payload, modified: MODIFIED }])
    const entries = readZip(archive)
    const totalEntries = entries.length

    expect(totalEntries).toBe(1)
    expect(entries[0].name).toBe("Juan Dela Cruz.jpg")
    expect(entries[0].data).toEqual(payload)
    expect(entries[0].crc).toBe(crc32(payload))
  })

  it("stores rather than compresses — photos are already compressed", async () => {
    const archive = await buildZip([{ name: "a.jpg", data: bytes("x"), modified: MODIFIED }])
    expect(readZip(archive)[0].method).toBe(0)
  })

  it("flags entry names as UTF-8 so accented names are not mangled", async () => {
    const archive = await buildZip([{ name: "José Peñaflor.jpg", data: bytes("x"), modified: MODIFIED }])
    const [entry] = readZip(archive)
    // Bit 11 of the general purpose flags.
    expect(entry.flags & 0x0800).toBe(0x0800)
    expect(entry.name).toBe("José Peñaflor.jpg")
  })

  it("measures the name length in UTF-8 BYTES, not characters", async () => {
    // 'ñ' is two bytes: a character count would put the payload offset one
    // byte early and every following entry would be misread.
    const payload = bytes("payload")
    const archive = await buildZip([{ name: "Peña.jpg", data: payload, modified: MODIFIED }])
    const entries = readZip(archive)
    expect(entries[0].data).toEqual(payload)
  })

  it("keeps multiple entries separate and correctly offset", async () => {
    const one = bytes("first photo")
    const two = bytes("second photo, a different length entirely")
    const three = bytes("3")
    const archive = await buildZip([
      { name: "Ana Reyes.jpg", data: one, modified: MODIFIED },
      { name: "Ben Cruz.png", data: two, modified: MODIFIED },
      { name: "Cara Lim.webp", data: three, modified: MODIFIED },
    ])
    const entries = readZip(archive)
    const totalEntries = entries.length

    expect(totalEntries).toBe(3)
    expect(entries.map((e) => e.name)).toEqual(["Ana Reyes.jpg", "Ben Cruz.png", "Cara Lim.webp"])
    expect(entries[0].data).toEqual(one)
    expect(entries[1].data).toEqual(two)
    expect(entries[2].data).toEqual(three)
    // Offsets must strictly increase — an overlap silently corrupts an entry.
    expect(entries[1].localOffset).toBeGreaterThan(entries[0].localOffset)
    expect(entries[2].localOffset).toBeGreaterThan(entries[1].localOffset)
  })

  it("produces a valid empty archive when there is nothing to add", async () => {
    const archive = await buildZip([])
    // An empty ZIP is exactly the 22-byte end-of-central-directory record.
    expect(archive.length).toBe(22)
    const totalEntries = readZip(archive).length
    expect(totalEntries).toBe(0)
  })

  it("handles a zero-byte file without corrupting the archive", async () => {
    const archive = await buildZip([
      { name: "empty.jpg", data: new Uint8Array(0), modified: MODIFIED },
      { name: "after.jpg", data: bytes("still here"), modified: MODIFIED },
    ])
    const entries = readZip(archive)
    expect(entries[0].data.length).toBe(0)
    expect(entries[0].crc).toBe(0)
    expect(entries[1].data).toEqual(bytes("still here"))
  })

  it("preserves binary payloads byte for byte", async () => {
    const binary = new Uint8Array(1024)
    for (let i = 0; i < binary.length; i++) binary[i] = (i * 7) & 0xff
    const archive = await buildZip([{ name: "b.jpg", data: binary, modified: MODIFIED }])
    expect(readZip(archive)[0].data).toEqual(binary)
  })
})

describe("zipChunks", () => {
  it("consumes entries lazily so photos download one at a time", async () => {
    const pulled: string[] = []
    async function* source(): AsyncGenerator<ZipEntry> {
      for (const name of ["one.jpg", "two.jpg", "three.jpg"]) {
        pulled.push(name)
        yield { name, data: bytes(name) }
      }
    }

    const iterator = zipChunks(source())
    // First chunk is entry one's local header: only the first photo has been
    // "downloaded" at that point.
    await iterator.next()
    expect(pulled).toEqual(["one.jpg"])

    await iterator.next() // entry one's data
    await iterator.next() // entry two's header
    expect(pulled).toEqual(["one.jpg", "two.jpg"])
  })

  it("propagates a mid-archive failure instead of finishing a short archive", async () => {
    async function* source(): AsyncGenerator<ZipEntry> {
      yield { name: "ok.jpg", data: bytes("fine") }
      throw new Error("photo download failed")
    }

    const chunks: Uint8Array[] = []
    await expect(async () => {
      for await (const chunk of zipChunks(source())) chunks.push(chunk)
    }).rejects.toThrow("photo download failed")
    // It got as far as the first entry, and never wrote a central directory.
    expect(chunks.length).toBeGreaterThan(0)
  })
})

describe("zipStream", () => {
  it("streams the same bytes buildZip produces", async () => {
    const entries: ZipEntry[] = [
      { name: "Ana Reyes.jpg", data: bytes("one"), modified: new Date(2026, 7, 30, 9, 0, 0) },
      { name: "Ben Cruz.jpg", data: bytes("two"), modified: new Date(2026, 7, 30, 9, 0, 0) },
    ]
    const expected = await buildZip(entries)

    const reader = zipStream(entries).getReader()
    const parts: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      parts.push(value)
      total += value.length
    }
    const streamed = new Uint8Array(total)
    let at = 0
    for (const part of parts) {
      streamed.set(part, at)
      at += part.length
    }

    expect(streamed).toEqual(expected)
    expect(readZip(streamed)).toHaveLength(2)
  })

  it("errors the stream when a photo fails mid-archive", async () => {
    async function* source(): AsyncGenerator<ZipEntry> {
      yield { name: "ok.jpg", data: bytes("fine") }
      throw new Error("storage down")
    }
    const reader = zipStream(source()).getReader()
    await reader.read() // local header
    await reader.read() // data
    await expect(reader.read()).rejects.toThrow("storage down")
  })

  it("stops pulling entries when the client cancels the download", async () => {
    let produced = 0
    async function* source(): AsyncGenerator<ZipEntry> {
      for (let i = 0; i < 50; i++) {
        produced++
        yield { name: `p${i}.jpg`, data: bytes("x") }
      }
    }

    const stream = zipStream(source())
    const reader = stream.getReader()
    await reader.read()
    await reader.cancel("client went away")

    // Let any pull already in flight settle, then prove nothing more is pulled.
    await new Promise((resolve) => setTimeout(resolve, 10))
    const settled = produced
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(produced).toBe(settled)
    expect(settled).toBeLessThan(5)
  })
})
