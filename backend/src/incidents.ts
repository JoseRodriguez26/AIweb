import { randomUUID } from "node:crypto";
import { createReadStream, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { isValidCoord } from "./geo.js";

// ==================================================================
// ⚠️ LEGAL REVIEW: incident reports (a user records a crime or emergency)
// - Never paid, never sold, never shown in search. Kept apart from photos.
// - Only the person who reported it can download it, to share with police.
// - Audio in videos may need everyone's consent (California and others).
// - The app must say "Call 911 first" and never encourage approaching danger.
// ==================================================================
export function registerIncidents(app: FastifyInstance, db: DatabaseSync, uploadDir: string) {
  app.post("/incidents", async (req, reply) => {
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

    const { userId, note = "", lat, lng } = fields;
    if (!file || !(mimetype.startsWith("image/") || mimetype.startsWith("video/"))) {
      return reply.code(400).send({ error: "photo_or_video_required" });
    }
    if (!userId || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) {
      return reply.code(400).send({ error: "unknown_user" });
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);
    const hasLocation = isValidCoord(latNum, lngNum);
    const id = randomUUID();
    const filePath = join(uploadDir, `incident-${id}.${mimetype.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin"}`);
    writeFileSync(filePath, file);
    db.prepare(
      "INSERT INTO incidents (id, user_id, file_path, mimetype, lat, lng, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, userId, filePath, mimetype, hasLocation ? latNum : null, hasLocation ? lngNum : null, note.trim(), new Date().toISOString());

    return reply.code(201).send({
      id,
      message: "Saved privately. If anyone is in danger, call 911. You can share this report with the police.",
    });
  });

  app.get<{ Params: { id: string }; Querystring: { userId?: string } }>("/incidents/:id/file", async (req, reply) => {
    const row = db
      .prepare("SELECT file_path, mimetype FROM incidents WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.query.userId ?? "") as { file_path: string; mimetype: string } | undefined;
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.type(row.mimetype).send(createReadStream(row.file_path));
  });
}
