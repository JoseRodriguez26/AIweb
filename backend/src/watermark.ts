import sharp from "sharp";

// Invisible watermark: the license ID is hidden in the lowest bit of the blue
// channel, repeated across the whole image, and read back by majority vote.
// Nobody can see it and it survives exact copies of the file. It does NOT
// survive cropping, resizing or JPEG re-compression; for that, swap this module
// for a robust commercial watermark (see docs/marketplace.md).

const MAGIC = Buffer.from("AIWB");
const PAYLOAD_BYTES = MAGIC.length + 16; // magic + license UUID
const PAYLOAD_BITS = PAYLOAD_BYTES * 8;
const BLUE = 2;

function uuidToBytes(uuid: string) {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(bytes: Buffer) {
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Returns a PNG with the license ID hidden in it. PNG keeps the hidden bits intact. */
export async function embedLicense(image: Buffer, licenseId: string): Promise<Buffer> {
  const payload = Buffer.concat([MAGIC, uuidToBytes(licenseId)]);
  const { data, info } = await sharp(image).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  if (pixels < PAYLOAD_BITS) throw new Error("image_too_small");

  for (let p = 0; p < pixels; p++) {
    const bit = p % PAYLOAD_BITS;
    const value = (payload[bit >> 3] >> (7 - (bit & 7))) & 1;
    const i = p * info.channels + BLUE;
    data[i] = (data[i] & 0xfe) | value;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .withMetadata({ exif: { IFD0: { Copyright: `Licensed via AIweb, license ${licenseId}` } } })
    .toBuffer();
}

/** Reads the hidden license ID back out of an image, or null if there is none. */
export async function extractLicense(image: Buffer): Promise<string | null> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  if (pixels < PAYLOAD_BITS) return null;

  const votes = new Int32Array(PAYLOAD_BITS);
  for (let p = 0; p < pixels; p++) {
    votes[p % PAYLOAD_BITS] += data[p * info.channels + BLUE] & 1 ? 1 : -1;
  }

  const payload = Buffer.alloc(PAYLOAD_BYTES);
  for (let bit = 0; bit < PAYLOAD_BITS; bit++) {
    if (votes[bit] > 0) payload[bit >> 3] |= 1 << (7 - (bit & 7));
  }
  if (!payload.subarray(0, MAGIC.length).equals(MAGIC)) return null;
  return bytesToUuid(payload.subarray(MAGIC.length));
}

/** Small, visibly marked preview so buyers can browse without getting the full photo. */
export async function makePreview(image: Buffer): Promise<Buffer> {
  const base = sharp(image).rotate().resize({ width: 480, withoutEnlargement: true });
  const { width = 480, height = 360 } = await base.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  const label = Buffer.from(
    `<svg width="${width}" height="${height}"><text x="50%" y="50%" text-anchor="middle" font-size="${Math.round(width / 8)}" font-family="sans-serif" fill="white" fill-opacity="0.55" stroke="black" stroke-opacity="0.3">AIweb preview</text></svg>`,
  );
  return base.composite([{ input: label }]).jpeg({ quality: 60 }).toBuffer();
}
