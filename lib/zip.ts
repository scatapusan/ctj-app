/**
 * Minimal streaming ZIP writer.
 *
 * Written by hand rather than pulled in as a dependency because what we need is
 * a small, well-specified subset: a flat archive of already-compressed photos.
 * The whole format used here is the 1989 PKZIP "store" method — no compression,
 * no ZIP64, no encryption — which every extractor on every platform reads,
 * including Windows Explorer's built-in "Extract All".
 *
 * Two properties matter for the retreat photo download:
 *
 * 1. STREAMING. The archive is emitted entry by entry, so the route holds one
 *    photo in memory at a time rather than ~90MB of them, and the browser
 *    starts receiving bytes immediately instead of after the last download.
 *    Each entry's CRC and size are known before its local header is written
 *    (we buffer that single photo), so no data descriptors are needed and the
 *    archive stays maximally compatible.
 *
 * 2. UTF-8 NAMES. Entry names are Filipino people's names — José, Peñaflor,
 *    Ramírez — so general-purpose bit 11 is always set to declare the name
 *    bytes as UTF-8. Without it, extractors guess at a legacy code page and
 *    mangle accented names.
 *
 * Deliberately NOT implemented: deflate (JPEG/PNG/WebP are already compressed,
 * so it would spend CPU to save nothing) and ZIP64 (see the 4GB guards below —
 * 44 registrants at a 5MB per-photo cap is three orders of magnitude away).
 */

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50

/** Store (no compression). */
const METHOD_STORE = 0
/** PKZIP 2.0 — the minimum that understands everything we emit. */
const VERSION_NEEDED = 20
/** Bit 11: file name (and comment) are UTF-8. */
const FLAG_UTF8_NAMES = 0x0800

/**
 * ZIP32 stores offsets and sizes in 32-bit fields. Past this, an archive needs
 * ZIP64 or it is silently corrupt, so we throw instead.
 */
const ZIP32_MAX = 0xffffffff

export interface ZipEntry {
  /** Entry name as it appears inside the archive. Use '/' for any nesting. */
  name: string
  data: Uint8Array
  /** Entry timestamp. Defaults to now; pass one for a reproducible archive. */
  modified?: Date
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

/** CRC-32 (IEEE 802.3, the variant ZIP uses) of a byte array. */
export function crc32(bytes: Uint8Array): number {
  let crc = -1
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

/**
 * MS-DOS date/time, the only timestamp a base ZIP entry carries. Two-second
 * resolution, and the epoch is 1980 — earlier dates are clamped rather than
 * wrapping into a nonsense year.
 */
export function dosDateTime(date: Date): { time: number; date: number } {
  const d = isNaN(date.getTime()) ? new Date() : date
  const year = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/** Little-endian writer over a fixed-size buffer. */
class ByteWriter {
  private readonly view: DataView
  private offset = 0
  readonly bytes: Uint8Array

  constructor(size: number) {
    this.bytes = new Uint8Array(size)
    this.view = new DataView(this.bytes.buffer)
  }

  u16(value: number): void {
    this.view.setUint16(this.offset, value, true)
    this.offset += 2
  }

  u32(value: number): void {
    this.view.setUint32(this.offset, value >>> 0, true)
    this.offset += 4
  }

  raw(value: Uint8Array): void {
    this.bytes.set(value, this.offset)
    this.offset += value.length
  }
}

interface CentralRecord {
  nameBytes: Uint8Array
  crc: number
  size: number
  time: number
  date: number
  offset: number
}

function localHeader(
  nameBytes: Uint8Array,
  crc: number,
  size: number,
  time: number,
  date: number,
): Uint8Array {
  const w = new ByteWriter(30 + nameBytes.length)
  w.u32(LOCAL_HEADER_SIGNATURE)
  w.u16(VERSION_NEEDED)
  w.u16(FLAG_UTF8_NAMES)
  w.u16(METHOD_STORE)
  w.u16(time)
  w.u16(date)
  w.u32(crc)
  w.u32(size) // compressed size == uncompressed size under store
  w.u32(size)
  w.u16(nameBytes.length)
  w.u16(0) // no extra field
  w.raw(nameBytes)
  return w.bytes
}

function centralHeader(record: CentralRecord): Uint8Array {
  const w = new ByteWriter(46 + record.nameBytes.length)
  w.u32(CENTRAL_HEADER_SIGNATURE)
  w.u16(VERSION_NEEDED) // version made by
  w.u16(VERSION_NEEDED) // version needed to extract
  w.u16(FLAG_UTF8_NAMES)
  w.u16(METHOD_STORE)
  w.u16(record.time)
  w.u16(record.date)
  w.u32(record.crc)
  w.u32(record.size)
  w.u32(record.size)
  w.u16(record.nameBytes.length)
  w.u16(0) // extra field length
  w.u16(0) // file comment length
  w.u16(0) // disk number start
  w.u16(0) // internal file attributes
  w.u32(0) // external file attributes
  w.u32(record.offset)
  w.raw(record.nameBytes)
  return w.bytes
}

function endOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
  const w = new ByteWriter(22)
  w.u32(END_OF_CENTRAL_DIR_SIGNATURE)
  w.u16(0) // this disk
  w.u16(0) // disk with the central directory
  w.u16(count) // entries on this disk
  w.u16(count) // entries total
  w.u32(size)
  w.u32(offset)
  w.u16(0) // no archive comment
  return w.bytes
}

/**
 * Emit a ZIP archive as a sequence of chunks, consuming entries lazily so a
 * caller can download each photo only when it is about to be written.
 *
 * Throws if the archive would exceed the 32-bit ZIP limits, rather than
 * emitting an archive that extractors would read as truncated garbage.
 */
export async function* zipChunks(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder()
  const central: CentralRecord[] = []
  let offset = 0

  for await (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const { time, date } = dosDateTime(entry.modified ?? new Date())

    if (entry.data.length > ZIP32_MAX) {
      throw new Error(`zip entry "${entry.name}" is too large for a ZIP32 archive`)
    }

    const header = localHeader(nameBytes, crc, entry.data.length, time, date)
    central.push({ nameBytes, crc, size: entry.data.length, time, date, offset })

    yield header
    yield entry.data

    offset += header.length + entry.data.length
    if (offset > ZIP32_MAX) {
      throw new Error("zip archive is too large for ZIP32; ZIP64 is not implemented")
    }
  }

  const directoryOffset = offset
  let directorySize = 0
  for (const record of central) {
    const header = centralHeader(record)
    directorySize += header.length
    yield header
  }

  if (directoryOffset + directorySize > ZIP32_MAX) {
    throw new Error("zip archive is too large for ZIP32; ZIP64 is not implemented")
  }

  yield endOfCentralDirectory(central.length, directorySize, directoryOffset)
}

/**
 * Wrap {@link zipChunks} as a web ReadableStream for a Response body.
 *
 * A mid-stream failure (a photo download dying half way through the archive)
 * errors the stream, which aborts the HTTP response. The browser then reports a
 * failed download instead of saving a truncated archive that appears to work
 * until someone opens it — the right trade for files people are relying on.
 */
export function zipStream(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): ReadableStream<Uint8Array> {
  const iterator = zipChunks(entries)[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (err) {
        controller.error(err)
      }
    },
    async cancel(reason) {
      // The client navigated away or hit cancel — stop downloading photos.
      await iterator.return?.(reason)
    },
  })
}

/** Build a whole archive in memory. Convenient for tests and small archives. */
export async function buildZip(entries: Iterable<ZipEntry>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of zipChunks(entries)) {
    chunks.push(chunk)
    total += chunk.length
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
