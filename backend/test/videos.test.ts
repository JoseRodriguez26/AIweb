import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { inspectVideo } from "../src/media.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "aiweb-"));
  return buildServer({ dbPath: join(dir, "test.db"), uploadDir: join(dir, "uploads") });
}

function box(type: string, body: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
}

// Minimal MP4: ftyp + moov > mvhd with the given length. `salt` makes each file unique.
function mp4(seconds: number, salt = "a", brand = "isom") {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12); // timescale
  mvhd.writeUInt32BE(Math.round(seconds * 1000), 16); // duration
  return Buffer.concat([box("ftyp", Buffer.from(`${brand}0000`, "latin1")), box("moov", box("mvhd", mvhd)), box("free", Buffer.from(salt))]);
}

// Minimal WebM: EBML header + Segment > Info > (TimecodeScale, Duration).
function webm(seconds: number) {
  const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80]);
  const scale = Buffer.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]); // 1,000,000
  const dur = Buffer.alloc(11);
  dur[0] = 0x44;
  dur[1] = 0x89;
  dur[2] = 0x88;
  dur.writeDoubleBE(seconds * 1000, 3);
  const info = Buffer.concat([Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x80 | (scale.length + dur.length)]), scale, dur]);
  const segment = Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), info]);
  return Buffer.concat([ebml, segment]);
}

function videoBody(fields: Record<string, string>, video: Buffer, contentType = "video/mp4") {
  const boundary = "----aiwebvideo";
  const parts = Object.entries(fields).map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  const body = Buffer.concat([
    Buffer.from(parts.join("")),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="v.mp4"\r\nContent-Type: ${contentType}\r\n\r\n`),
    video,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function newUser(app: ReturnType<typeof setup>) {
  return (await app.inject({ method: "POST", url: "/users" })).json().id as string;
}

const base = (userId: string) => ({
  userId,
  description: "Street band playing in Dolores Park",
  lat: "37.7596",
  lng: "-122.4269",
  locationConsent: "true",
  termsAccepted: "true",
});

test("reads real length from MP4, MOV and WebM bytes", () => {
  assert.deepEqual(inspectVideo(mp4(12.5)), { mimetype: "video/mp4", ext: "mp4", durationSec: 12.5 });
  assert.equal(inspectVideo(mp4(3, "x", "qt  "))?.mimetype, "video/quicktime");
  assert.equal(inspectVideo(webm(7))?.durationSec, 7);
  assert.equal(inspectVideo(Buffer.from("<html><script>alert(1)</script></html>")), undefined);
});

test("valid short video is paid, listed, and streamed with ranges", async () => {
  const app = setup();
  const userId = await newUser(app);
  const res = await app.inject({ method: "POST", url: "/videos", ...videoBody(base(userId), mp4(15)) });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().earnedCents, 1);

  const balance = (await app.inject({ method: "GET", url: `/users/${userId}/balance` })).json();
  assert.equal(balance.balanceCents, 1);

  const list = (await app.inject({ method: "GET", url: "/videos" })).json().results;
  assert.equal(list.length, 1);

  const full = await app.inject({ method: "GET", url: list[0].videoUrl });
  assert.equal(full.headers["content-type"], "video/mp4");
  assert.equal(full.headers["x-content-type-options"], "nosniff");
  const part = await app.inject({ method: "GET", url: list[0].videoUrl, headers: { range: "bytes=0-9" } });
  assert.equal(part.statusCode, 206);
  assert.equal(part.rawPayload.length, 10);
});

test("rejects disguised files, long videos, duplicates and links", async () => {
  const app = setup();
  const userId = await newUser(app);
  const post = (fields: Record<string, string>, video: Buffer) => app.inject({ method: "POST", url: "/videos", ...videoBody(fields, video) });

  const fake = await post(base(userId), Buffer.from("MZ this is really an exe"));
  assert.equal(fake.json().error, "not_a_video");
  const long = await post(base(userId), mp4(90));
  assert.equal(long.json().error, "video_too_long");
  const link = await post({ ...base(userId), description: "buy now at cheap-stuff.xyz" }, mp4(5, "l"));
  assert.equal(link.json().error, "no_links");

  assert.equal((await post(base(userId), mp4(5, "d"))).statusCode, 201);
  const dup = await post(base(userId), mp4(5, "d"));
  assert.equal(dup.statusCode, 409);
});

test("caps uploads per user per hour", async () => {
  const app = setup();
  const userId = await newUser(app);
  for (let i = 0; i < 5; i++) {
    const r = await app.inject({ method: "POST", url: "/videos", ...videoBody(base(userId), mp4(5, `n${i}`)) });
    assert.equal(r.statusCode, 201, r.body);
  }
  const sixth = await app.inject({ method: "POST", url: "/videos", ...videoBody(base(userId), mp4(5, "n6")) });
  assert.equal(sixth.statusCode, 429);
});

test("three reports from different people hide a video", async () => {
  const app = setup();
  const owner = await newUser(app);
  const { id } = (await app.inject({ method: "POST", url: "/videos", ...videoBody(base(owner), mp4(5)) })).json();

  const reporter = await newUser(app);
  // The same person reporting twice only counts once.
  await app.inject({ method: "POST", url: `/videos/${id}/flag`, payload: { userId: reporter } });
  const again = (await app.inject({ method: "POST", url: `/videos/${id}/flag`, payload: { userId: reporter } })).json();
  assert.equal(again.flags, 1);

  for (let i = 0; i < 2; i++) {
    await app.inject({ method: "POST", url: `/videos/${id}/flag`, payload: { userId: await newUser(app) } });
  }
  assert.equal((await app.inject({ method: "GET", url: "/videos" })).json().results.length, 0);
  assert.equal((await app.inject({ method: "GET", url: `/videos/${id}/file` })).statusCode, 404);
});
