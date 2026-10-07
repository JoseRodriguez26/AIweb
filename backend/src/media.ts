// Checks what a video file really is by reading its bytes, never trusting the
// file name or the content type the uploader sent.

export type VideoInfo = { mimetype: "video/mp4" | "video/quicktime" | "video/webm"; ext: string; durationSec: number };

export function inspectVideo(buf: Buffer): VideoInfo | undefined {
  // MP4 / MOV: the file starts with an "ftyp" box.
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12);
    const durationSec = mp4Duration(buf);
    if (durationSec === undefined) return undefined;
    return brand === "qt  "
      ? { mimetype: "video/quicktime", ext: "mov", durationSec }
      : { mimetype: "video/mp4", ext: "mp4", durationSec };
  }
  // WebM: EBML header magic.
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) {
    const durationSec = webmDuration(buf);
    if (durationSec === undefined) return undefined;
    return { mimetype: "video/webm", ext: "webm", durationSec };
  }
  return undefined;
}

// Finds moov > mvhd and reads duration / timescale.
function mp4Duration(buf: Buffer): number | undefined {
  const moov = findBox(buf, 0, buf.length, "moov");
  if (!moov) return undefined;
  const mvhd = findBox(buf, moov.start, moov.end, "mvhd");
  if (!mvhd) return undefined;
  const p = mvhd.start;
  if (p + 1 > buf.length) return undefined;
  const version = buf[p];
  if (version === 1) {
    if (p + 32 > buf.length) return undefined;
    const timescale = buf.readUInt32BE(p + 20);
    const duration = Number(buf.readBigUInt64BE(p + 24));
    return timescale ? duration / timescale : undefined;
  }
  if (p + 20 > buf.length) return undefined;
  const timescale = buf.readUInt32BE(p + 12);
  const duration = buf.readUInt32BE(p + 16);
  return timescale ? duration / timescale : undefined;
}

// Returns the contents range of the first box of the given type in [from, to).
function findBox(buf: Buffer, from: number, to: number, type: string) {
  let pos = from;
  while (pos + 8 <= to) {
    let size = buf.readUInt32BE(pos);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > to) return undefined;
      size = Number(buf.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = to - pos;
    }
    if (size < header || pos + size > to) return undefined;
    if (buf.toString("latin1", pos + 4, pos + 8) === type) return { start: pos + header, end: pos + size };
    pos += size;
  }
  return undefined;
}

// Reads Segment > Info > Duration (scaled by TimecodeScale) from a WebM file.
function webmDuration(buf: Buffer): number | undefined {
  const header = readElement(buf, 0);
  if (!header) return undefined;
  const segment = readElement(buf, header.dataEnd);
  if (!segment || segment.id !== 0x18538067) return undefined;

  let pos = segment.dataStart;
  const end = Math.min(segment.dataEnd, buf.length);
  while (pos < end) {
    const el = readElement(buf, pos);
    if (!el) return undefined;
    if (el.id === 0x1549a966) {
      let timecodeScale = 1_000_000;
      let duration: number | undefined;
      let p = el.dataStart;
      while (p < el.dataEnd) {
        const child = readElement(buf, p);
        if (!child) break;
        const len = child.dataEnd - child.dataStart;
        if (child.id === 0x2ad7b1 && len >= 1 && len <= 6) timecodeScale = buf.readUIntBE(child.dataStart, len);
        if (child.id === 0x4489 && len === 4) duration = buf.readFloatBE(child.dataStart);
        if (child.id === 0x4489 && len === 8) duration = buf.readDoubleBE(child.dataStart);
        p = child.dataEnd;
      }
      return duration === undefined ? undefined : (duration * timecodeScale) / 1e9;
    }
    pos = el.dataEnd;
  }
  return undefined;
}

function readElement(buf: Buffer, pos: number) {
  const id = readVint(buf, pos, true);
  if (!id) return undefined;
  const size = readVint(buf, pos + id.length, false);
  if (!size) return undefined;
  const dataStart = pos + id.length + size.length;
  // Unknown size (live recordings): treat the element as running to the end of the file.
  const dataEnd = size.unknown ? buf.length : dataStart + size.value;
  if (dataEnd > buf.length && !size.unknown) {
    // Allow a Segment that claims more bytes than we hold, but nothing else.
    if (id.value !== 0x18538067) return undefined;
  }
  return { id: id.value, dataStart, dataEnd: Math.min(dataEnd, buf.length) };
}

function readVint(buf: Buffer, pos: number, keepMarker: boolean) {
  if (pos >= buf.length) return undefined;
  const first = buf[pos];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || pos + length > buf.length) return undefined;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = (first & (0xff >> length)) === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}
