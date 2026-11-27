import { open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

/** End of central directory: fixed 22 bytes plus a comment of up to 64 KiB. */
const EOCD_MAX = 22 + 0xffff;

/**
 * Reads entries of a .jar/.zip without extracting it: only the central directory and the wanted
 * entries are read, so large jars cost a few kilobytes. Returns the entries found, by name.
 * Zip64 archives (over 4 GiB or 65535 entries) are not supported: they return nothing.
 */
export async function readZipEntries(path: string, names: readonly string[]): Promise<Map<string, Buffer>> {
  const found = new Map<string, Buffer>();
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, EOCD_MAX);
    const tail = Buffer.alloc(tailLength);
    await file.read(tail, 0, tailLength, size - tailLength);
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0 || eocd + 22 > tailLength) {
      return found;
    }
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || cdOffset + cdSize > size) {
      return found;
    }
    const cd = Buffer.alloc(cdSize);
    await file.read(cd, 0, cdSize, cdOffset);
    const wanted = new Set(names);
    for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
      const method = cd.readUInt16LE(p + 10);
      const compressedSize = cd.readUInt32LE(p + 20);
      const nameLength = cd.readUInt16LE(p + 28);
      const extraLength = cd.readUInt16LE(p + 30);
      const commentLength = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLength);
      p += 46 + nameLength + extraLength + commentLength;
      if (!wanted.has(name) || (method !== 0 && method !== 8)) {
        continue;
      }
      const local = Buffer.alloc(30);
      await file.read(local, 0, 30, localOffset);
      if (local.readUInt32LE(0) !== 0x04034b50) {
        continue;
      }
      const data = Buffer.alloc(compressedSize);
      await file.read(data, 0, compressedSize, localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28));
      found.set(name, method === 8 ? inflateRawSync(data) : data);
    }
    return found;
  } finally {
    await file.close();
  }
}
