import { createHash, randomUUID } from "node:crypto";
import { createReadStream, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { CENTS_PER_VIDEO } from "./db.js";
import { isValidCoord } from "./geo.js";
import { inspectVideo } from "./media.js";
import { rateLimiter } from "./limits.js";

// Short videos: any topic, but only real video files, short, not duplicated,
// and capped per person so the pay can't be farmed by spam.
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
const MIN_DESCRIPTION_LENGTH = 5;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_VIDEOS_PER_USER_PER_HOUR = 5;
// Uploads past this many in a day are still posted, just not paid.
export const MAX_PAID_VIDEOS_PER_DAY = 20;
// Hidden once this many different people report it.
export const FLAGS_TO_HIDE = 3;

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|ru|top|link|click)\b)/i;

export function registerVideos(app: FastifyInstance, db: DatabaseSync, uploadDir: string) {
  // Per network address, checked before the upload is read so floods cost us little.
  const uploadsPerIp = rateLimiter(20, 60 * 60 * 1000);

  app.post("/videos", async (req, reply) => {
    if (!uploadsPerIp(req.ip)) return reply.code(429).send({ error: "too_many_uploads" });

    const fields: Record<string, string> = {};
    let file: Buffer | undefined;
    try {
      for await (const part of req.parts({ limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 20 } })) {
        if (part.type === "file") file = await part.toBuffer();
        else fields[part.fieldname] = String(part.value);
      }
    } catch (err) {
      if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") return reply.code(413).send({ error: "video_too_large" });
      return reply.code(400).send({ error: "bad_upload" });
    }

    const { userId, description = "", lat, lng, locationConsent, termsAccepted } = fields;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const text = description.trim();

    if (!userId || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) return bad(reply, "unknown_user");
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = db.prepare("SELECT COUNT(*) AS n FROM videos WHERE user_id = ? AND created_at > ?").get(userId, hourAgo) as { n: number };
    if (recent.n >= MAX_VIDEOS_PER_USER_PER_HOUR) return reply.code(429).send({ error: "too_many_uploads" });

    if (!file) return bad(reply, "video_required");
    // ⚠️ LEGAL REVIEW: the terms grant the app the rights to the video, same as photos.
    if (termsAccepted !== "true") return bad(reply, "terms_not_accepted");
    if (locationConsent !== "true") return bad(reply, "location_consent_required");
    if (!isValidCoord(latNum, lngNum)) return bad(reply, "invalid_location");
    if (text.length < MIN_DESCRIPTION_LENGTH) return bad(reply, "description_too_short");
    if (text.length > MAX_DESCRIPTION_LENGTH) return bad(reply, "description_too_long");
    if (LINK.test(text)) return bad(reply, "no_links");

    const info = inspectVideo(file);
    if (!info) return bad(reply, "not_a_video");
    if (info.durationSec <= 0) return bad(reply, "not_a_video");
    if (info.durationSec > MAX_VIDEO_SECONDS + 0.5) return bad(reply, "video_too_long");

    const sha256 = createHash("sha256").update(file).digest("hex");
    if (db.prepare("SELECT 1 FROM videos WHERE sha256 = ?").get(sha256)) return reply.code(409).send({ error: "duplicate_video" });

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const paidToday = db
      .prepare("SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND reason = 'video_accepted' AND created_at > ?")
      .get(userId, dayAgo) as { n: number };
    const earnedCents = paidToday.n < MAX_PAID_VIDEOS_PER_DAY ? CENTS_PER_VIDEO : 0;

    // The stored name is ours, never the uploader's.
    const id = randomUUID();
    const now = new Date().toISOString();
    const filePath = join(uploadDir, `video-${id}.${info.ext}`);
    writeFileSync(filePath, file);

    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO videos (id, user_id, description, lat, lng, sha256, file_path, mimetype, duration_sec, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, userId, text, latNum, lngNum, sha256, filePath, info.mimetype, info.durationSec, now);
      if (earnedCents > 0) {
        db.prepare("INSERT INTO ledger (user_id, video_id, cents, reason, created_at) VALUES (?, ?, ?, 'video_accepted', ?)").run(
          userId,
          id,
          earnedCents,
          now,
        );
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return reply.code(201).send({ id, earnedCents, durationSec: Math.round(info.durationSec) });
  });

  // Newest visible videos first.
  app.get("/videos", async () => {
    const rows = db
      .prepare(
        "SELECT id, description, lat, lng, duration_sec AS durationSec, created_at AS createdAt FROM videos WHERE hidden = 0 ORDER BY created_at DESC LIMIT 50",
      )
      .all() as { id: string }[];
    return { results: rows.map((r) => ({ ...r, videoUrl: `/videos/${r.id}/file` })) };
  });

  // Streams the file with byte ranges, which phones and Safari need to play video.
  app.get<{ Params: { id: string } }>("/videos/:id/file", async (req, reply) => {
    const row = db.prepare("SELECT file_path, mimetype FROM videos WHERE id = ? AND hidden = 0").get(req.params.id) as
      | { file_path: string; mimetype: string }
      | undefined;
    if (!row) return reply.code(404).send({ error: "not_found" });

    const size = statSync(row.file_path).size;
    reply.header("accept-ranges", "bytes").header("content-disposition", "inline").type(row.mimetype);

    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (!range || (!range[1] && !range[2])) return reply.header("content-length", size).send(createReadStream(row.file_path));

    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return reply.code(416).header("content-range", `bytes */${size}`).send();
    return reply
      .code(206)
      .header("content-range", `bytes ${start}-${end}/${size}`)
      .header("content-length", end - start + 1)
      .send(createReadStream(row.file_path, { start, end }));
  });

  // Anyone signed in can report a video; enough reports from different people hide it.
  app.post<{ Params: { id: string }; Body: { userId?: string } }>("/videos/:id/flag", async (req, reply) => {
    const userId = req.body?.userId;
    if (!userId || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) return bad(reply, "unknown_user");
    if (!db.prepare("SELECT 1 FROM videos WHERE id = ?").get(req.params.id)) return reply.code(404).send({ error: "not_found" });
    db.prepare("INSERT OR IGNORE INTO video_flags (video_id, user_id, created_at) VALUES (?, ?, ?)").run(
      req.params.id,
      userId,
      new Date().toISOString(),
    );
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM video_flags WHERE video_id = ?").get(req.params.id) as { n: number };
    if (n >= FLAGS_TO_HIDE) db.prepare("UPDATE videos SET hidden = 1 WHERE id = ?").run(req.params.id);
    return { flags: n, hidden: n >= FLAGS_TO_HIDE };
  });
}

function bad(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: string) {
  return reply.code(400).send({ error });
}
