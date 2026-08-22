/**
 * A ZIP reader for tests, written independently of lib/zip.ts.
 *
 * It walks the central directory the way a real extractor does — follow each
 * record's offset into its local header, then read the payload from there —
 * so an archive that only makes sense to its own writer fails here.
 *
 * Throws on anything malformed rather than asserting, so it can be used from
 * any test file.
 */

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50

export interface ParsedZipEntry {
  name: string
  data: Uint8Array
  crc: number
  /** General purpose bit flags. Bit 11 (0x0800) declares a UTF-8 name. */
  flags: number
  /** 0 = stored, 8 = deflated. */
  method: number
  localOffset: number
  /** MS-DOS date/time fields, as stored. */
  dosTime: number
  dosDate: number
}

export function readZip(archive: Uint8Array): ParsedZipEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const decoder = new TextDecoder("utf-8", { fatal: true })

  let eocd = -1
  for (let i = archive.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("not a zip archive: no end-of-central-directory record")

  const totalEntries = view.getUint16(eocd + 10, true)
  const directorySize = view.getUint32(eocd + 12, true)
  const directoryOffset = view.getUint32(eocd + 16, true)
  if (directoryOffset + directorySize !== eocd) {
    throw new Error("central directory does not end where the EOCD record begins")
  }

  const entries: ParsedZipEntry[] = []
  let at = directoryOffset

  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(at, true) !== CENTRAL_SIG) {
      throw new Error(`central directory entry ${i} has a bad signature`)
    }
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const dosTime = view.getUint16(at + 12, true)
    const dosDate = view.getUint16(at + 14, true)
    const crc = view.getUint32(at + 16, true)
    const compressedSize = view.getUint32(at + 20, true)
    const uncompressedSize = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localOffset = view.getUint32(at + 42, true)
    const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength))

    if (method === 0 && compressedSize !== uncompressedSize) {
      throw new Error(`stored entry "${name}" has mismatched sizes`)
    }
    if (view.getUint32(localOffset, true) !== LOCAL_SIG) {
      throw new Error(`entry "${name}" points at a bad local header`)
    }

    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const localName = decoder.decode(
      archive.subarray(localOffset + 30, localOffset + 30 + localNameLength),
    )
    if (localName !== name) {
      throw new Error(`entry name disagrees: "${name}" in directory, "${localName}" locally`)
    }
    if (view.getUint32(localOffset + 14, true) !== crc) {
      throw new Error(`entry "${name}" has a different CRC in its local header`)
    }

    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    if (dataStart + uncompressedSize > archive.length) {
      throw new Error(`entry "${name}" runs past the end of the archive`)
    }

    entries.push({
      name,
      data: archive.subarray(dataStart, dataStart + uncompressedSize),
      crc,
      flags,
      method,
      localOffset,
      dosTime,
      dosDate,
    })

    at += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** Read a whole streamed body into one buffer. */
export async function collectStream(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0)
  const reader = body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parts.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
