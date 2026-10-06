import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "aiweb-"));
  return buildServer({ dbPath: join(dir, "test.db"), uploadDir: join(dir, "uploads") });
}

function uploadBody(fields: Record<string, string>, image: Buffer) {
  const boundary = "----aiwebtest";
  const parts = Object.entries(fields).map(
    ([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
  );
  const body = Buffer.concat([
    Buffer.from(parts.join("")),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

test("accepted photo earns 1 cent, duplicate is rejected, search finds it", async () => {
  const app = setup();
  const { id: userId } = (await app.inject({ method: "POST", url: "/users" })).json();

  const fields = {
    userId,
    description: "Taco truck on Mission St",
    lat: "37.7599",
    lng: "-122.4148",
    locationConsent: "true",
  };
  const image = Buffer.from("fake-jpeg-bytes-1");

  const first = await app.inject({ method: "POST", url: "/photos", ...uploadBody(fields, image) });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().earnedCents, 1);

  const dup = await app.inject({ method: "POST", url: "/photos", ...uploadBody(fields, image) });
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.json().error, "duplicate_photo");

  const balance = (await app.inject({ url: `/users/${userId}/balance` })).json();
  assert.deepEqual(balance, { userId, acceptedPhotos: 1, balanceCents: 1 });

  const near = (await app.inject({ url: "/search?q=taco&lat=37.76&lng=-122.41&radiusKm=2" })).json();
  assert.equal(near.results.length, 1);

  const far = (await app.inject({ url: "/search?q=taco&lat=40.71&lng=-74.0&radiusKm=2" })).json();
  assert.equal(far.results.length, 0);

  await app.close();
});

test("upload without location consent is rejected", async () => {
  const app = setup();
  const { id: userId } = (await app.inject({ method: "POST", url: "/users" })).json();
  const res = await app.inject({
    method: "POST",
    url: "/photos",
    ...uploadBody(
      { userId, description: "Park bench", lat: "37.7", lng: "-122.4", locationConsent: "false" },
      Buffer.from("img"),
    ),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "location_consent_required");
  await app.close();
});
