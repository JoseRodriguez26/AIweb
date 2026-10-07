import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, createReadStream } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import { openDb, CENTS_PER_PHOTO } from "./db.js";
import { registerMarketplace } from "./marketplace.js";
import { haversineKm, isValidCoord } from "./geo.js";
import { FEATURES } from "./features.js";
import { registerPayouts } from "./payouts.js";
import { registerIncidents } from "./incidents.js";

export type ServerOptions = {
  dbPath: string;
  uploadDir: string;
};

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
// Incident videos can be larger than photos.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MIN_DESCRIPTION_LENGTH = 5;

export function buildServer({ dbPath, uploadDir }: ServerOptions) {
  mkdirSync(uploadDir, { recursive: true });
  const db = openDb(dbPath);
  const app = Fastify({ logger: false });
  app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  // Lets the browser version of the app (Expo web) call this server.
  app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, madeIn: "San Francisco, for the world" }));

  // Which features are switched on, so the app can hide the rest.
  app.get("/features", async () => FEATURES);

  app.post("/users", async (_req, reply) => {
    const id = randomUUID();
    db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run(id, new Date().toISOString());
    return reply.code(201).send({ id });
  });

  app.post("/photos", async (req, reply) => {
    const fields: Record<string, string> = {};
    let file: Buffer | undefined;
    let mimetype = "";

    for await (const part of req.parts()) {
      if (part.type === "file") {
        file = await part.toBuffer();
        mimetype = part.mimetype;
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }

    const { userId, description = "", lat, lng, locationConsent, termsAccepted, source = "phone" } = fields;
    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (!file || !mimetype.startsWith("image/")) return reject(reply, "photo_required");
    if (file.length > MAX_PHOTO_BYTES) return reject(reply, "photo_too_large", 413);
    if (!userId || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) return reject(reply, "unknown_user");
    if (source !== "phone" && source !== "glasses") return reject(reply, "invalid_source");
    // ⚠️ LEGAL REVIEW: smart-glasses capture (see features.ts)
    if (source === "glasses" && !FEATURES.glassesCapture) return reject(reply, "feature_disabled", 403);
    // ⚠️ LEGAL REVIEW: the terms grant the app the rights to the photo, including selling licenses to businesses.
    if (termsAccepted !== "true") return reject(reply, "terms_not_accepted");
    if (locationConsent !== "true") return reject(reply, "location_consent_required");
    if (description.trim().length < MIN_DESCRIPTION_LENGTH) return reject(reply, "description_too_short");
    if (!isValidCoord(latNum, lngNum)) return reject(reply, "invalid_location");

    const sha256 = createHash("sha256").update(file).digest("hex");
    if (db.prepare("SELECT 1 FROM photos WHERE sha256 = ?").get(sha256)) {
      return reject(reply, "duplicate_photo", 409);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const filePath = join(uploadDir, `${id}.${extensionFor(mimetype)}`);
    writeFileSync(filePath, file);

    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO photos (id, user_id, description, lat, lng, sha256, file_path, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, userId, description.trim(), latNum, lngNum, sha256, filePath, source, now);
      db.prepare(
        "INSERT INTO ledger (user_id, photo_id, cents, reason, created_at) VALUES (?, ?, ?, 'photo_accepted', ?)",
      ).run(userId, id, CENTS_PER_PHOTO, now);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return reply.code(201).send({ id, earnedCents: CENTS_PER_PHOTO });
  });

  app.get<{ Params: { id: string } }>("/users/:id/balance", async (req, reply) => {
    const row = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM photos WHERE user_id = ?) AS photos,
           (SELECT COALESCE(SUM(cents), 0) FROM ledger WHERE user_id = ?) AS cents`,
      )
      .get(req.params.id, req.params.id) as { photos: number; cents: number };
    if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(req.params.id)) {
      return reply.code(404).send({ error: "unknown_user" });
    }
    return { userId: req.params.id, acceptedPhotos: row.photos, balanceCents: row.cents };
  });

  app.get<{ Querystring: { q?: string; lat?: string; lng?: string; radiusKm?: string } }>(
    "/search",
    async (req) => {
      const words = (req.query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const rows = db
        .prepare("SELECT id, description, lat, lng, created_at AS createdAt FROM photos ORDER BY created_at DESC LIMIT 1000")
        .all() as { id: string; description: string; lat: number; lng: number; createdAt: string }[];

      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const nearby = isValidCoord(lat, lng);
      const radiusKm = Number(req.query.radiusKm ?? 5);

      const results = rows
        .map((r) => ({ ...r, distanceKm: nearby ? haversineKm(lat, lng, r.lat, r.lng) : undefined }))
        .filter((r) => words.every((w) => r.description.toLowerCase().includes(w)))
        .filter((r) => !nearby || (r.distanceKm ?? Infinity) <= radiusKm)
        .sort((a, b) => (nearby ? (a.distanceKm ?? 0) - (b.distanceKm ?? 0) : 0))
        .slice(0, 50)
        .map((r) => ({ ...r, imageUrl: `/photos/${r.id}/image` }));

      return { results };
    },
  );

  app.get<{ Params: { id: string } }>("/photos/:id/image", async (req, reply) => {
    const row = db.prepare("SELECT file_path FROM photos WHERE id = ?").get(req.params.id) as
      | { file_path: string }
      | undefined;
    if (!row) return reply.code(404).send({ error: "not_found" });
    const ext = row.file_path.split(".").pop();
    return reply.type(`image/${ext === "jpg" ? "jpeg" : ext}`).send(createReadStream(row.file_path));
  });

  if (FEATURES.marketplace) registerMarketplace(app, db);
  if (FEATURES.payouts) registerPayouts(app, db);
  if (FEATURES.incidentReports) registerIncidents(app, db, uploadDir);

  app.addHook("onClose", async () => db.close());
  return app;
}

function reject(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: string, status = 400) {
  return reply.code(status).send({ error });
}

function extensionFor(mimetype: string) {
  if (mimetype === "image/png") return "png";
  if (mimetype === "image/heic") return "heic";
  if (mimetype === "image/webp") return "webp";
  return "jpg";
}
