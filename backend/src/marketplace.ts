import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { CONTRIBUTOR_SHARE, LICENSE_PRICE_CENTS } from "./db.js";
import { haversineKm, isValidCoord } from "./geo.js";
import { embedLicense, extractLicense, makePreview } from "./watermark.js";

type PhotoRow = { id: string; description: string; lat: number; lng: number; createdAt: string };

// Businesses and creators buy commercial licenses for fresh photos of a place.
export function registerMarketplace(app: FastifyInstance, db: DatabaseSync) {
  app.post<{ Body: { name?: string; email?: string } }>("/buyers", async (req, reply) => {
    const { name, email } = req.body ?? {};
    if (!name || !email || !email.includes("@")) return reply.code(400).send({ error: "name_and_email_required" });
    const id = randomUUID();
    db.prepare("INSERT INTO buyers (id, name, email, created_at) VALUES (?, ?, ?, ?)").run(
      id,
      name,
      email,
      new Date().toISOString(),
    );
    return reply.code(201).send({ id });
  });

  // Browse licensable photos by keyword and/or area, newest first (or nearest first with a location).
  app.get<{ Querystring: { q?: string; lat?: string; lng?: string; radiusKm?: string } }>(
    "/marketplace",
    async (req) => {
      const words = (req.query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const nearby = isValidCoord(lat, lng);
      const radiusKm = Number(req.query.radiusKm ?? 5);

      const rows = db
        .prepare(
          "SELECT id, description, lat, lng, created_at AS createdAt FROM photos WHERE commercial_ok = 1 ORDER BY created_at DESC LIMIT 1000",
        )
        .all() as PhotoRow[];

      const results = rows
        .map((r) => ({ ...r, distanceKm: nearby ? haversineKm(lat, lng, r.lat, r.lng) : undefined }))
        .filter((r) => words.every((w) => r.description.toLowerCase().includes(w)))
        .filter((r) => !nearby || (r.distanceKm ?? Infinity) <= radiusKm)
        .sort((a, b) => (nearby ? (a.distanceKm ?? 0) - (b.distanceKm ?? 0) : 0))
        .slice(0, 50)
        .map((r) => ({ ...r, priceCents: LICENSE_PRICE_CENTS, previewUrl: `/marketplace/photos/${r.id}/preview` }));

      return { results };
    },
  );

  app.get<{ Params: { id: string } }>("/marketplace/photos/:id/preview", async (req, reply) => {
    const row = licensablePhoto(db, req.params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.type("image/jpeg").send(await makePreview(readFileSync(row.file_path)));
  });

  // Buy a license. Payment is a placeholder: wire Stripe Checkout in here before taking real money.
  app.post<{ Body: { buyerId?: string; photoId?: string } }>("/licenses", async (req, reply) => {
    const { buyerId, photoId } = req.body ?? {};
    if (!buyerId || !db.prepare("SELECT 1 FROM buyers WHERE id = ?").get(buyerId)) {
      return reply.code(400).send({ error: "unknown_buyer" });
    }
    const photo = photoId ? licensablePhoto(db, photoId) : undefined;
    if (!photo) return reply.code(404).send({ error: "photo_not_for_sale" });

    const id = randomUUID();
    const now = new Date().toISOString();
    const contributorCents = Math.floor(LICENSE_PRICE_CENTS * CONTRIBUTOR_SHARE);

    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO licenses (id, photo_id, buyer_id, price_cents, contributor_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, photo.id, buyerId, LICENSE_PRICE_CENTS, contributorCents, now);
      db.prepare(
        "INSERT INTO ledger (user_id, photo_id, cents, reason, created_at) VALUES (?, ?, ?, 'photo_sold', ?)",
      ).run(photo.user_id, photo.id, contributorCents, now);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return reply.code(201).send({
      licenseId: id,
      priceCents: LICENSE_PRICE_CENTS,
      downloadUrl: `/licenses/${id}/download?buyerId=${buyerId}`,
    });
  });

  // Full-resolution photo with the license ID hidden inside it.
  app.get<{ Params: { id: string }; Querystring: { buyerId?: string } }>(
    "/licenses/:id/download",
    async (req, reply) => {
      const row = db
        .prepare(
          "SELECT p.file_path FROM licenses l JOIN photos p ON p.id = l.photo_id WHERE l.id = ? AND l.buyer_id = ?",
        )
        .get(req.params.id, req.query.buyerId ?? "") as { file_path: string } | undefined;
      if (!row) return reply.code(404).send({ error: "not_found" });
      const image = await embedLicense(readFileSync(row.file_path), req.params.id);
      return reply
        .type("image/png")
        .header("content-disposition", `attachment; filename="aiweb-${req.params.id}.png"`)
        .send(image);
    },
  );

  // Found one of our photos online? Upload it here to see which license (if any) it came from.
  app.post("/licenses/verify", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "photo_required" });
    const licenseId = await extractLicense(await file.toBuffer()).catch(() => null);
    if (!licenseId) return { licensed: false };
    const row = db
      .prepare(
        "SELECT l.id AS licenseId, l.photo_id AS photoId, b.name AS buyerName, l.created_at AS purchasedAt FROM licenses l JOIN buyers b ON b.id = l.buyer_id WHERE l.id = ?",
      )
      .get(licenseId);
    return row ? { licensed: true, ...row } : { licensed: false };
  });
}

function licensablePhoto(db: DatabaseSync, id: string) {
  return db.prepare("SELECT id, user_id, file_path FROM photos WHERE id = ? AND commercial_ok = 1").get(id) as
    | { id: string; user_id: string; file_path: string }
    | undefined;
}
