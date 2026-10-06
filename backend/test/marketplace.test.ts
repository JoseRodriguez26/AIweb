import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildServer } from "../src/server.js";
import { extractLicense } from "../src/watermark.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "aiweb-"));
  return buildServer({ dbPath: join(dir, "test.db"), uploadDir: join(dir, "uploads") });
}

function multipart(fields: Record<string, string>, image: Buffer) {
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

function photo(color: string) {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).jpeg().toBuffer();
}

test("buyer licenses a Golden Gate photo, gets a hidden license ID, photographer is paid", async () => {
  const app = setup();
  const { id: userId } = (await app.inject({ method: "POST", url: "/users" })).json();
  const base = { userId, lat: "37.8199", lng: "-122.4783", locationConsent: "true" };

  const forSale = await app.inject({
    method: "POST",
    url: "/photos",
    ...multipart({ ...base, description: "Golden Gate Bridge at sunset", commercialLicenseConsent: "true" }, await photo("#c0362c")),
  });
  assert.equal(forSale.statusCode, 201);
  const photoId = forSale.json().id;

  // Photographer did not opt in, so this one must not be for sale.
  await app.inject({
    method: "POST",
    url: "/photos",
    ...multipart({ ...base, description: "Golden Gate Bridge in fog" }, await photo("#999999")),
  });

  const listing = (await app.inject({ url: "/marketplace?q=golden+gate&lat=37.82&lng=-122.48&radiusKm=3" })).json();
  assert.equal(listing.results.length, 1);
  assert.equal(listing.results[0].id, photoId);

  const preview = await app.inject({ url: listing.results[0].previewUrl });
  assert.equal(preview.headers["content-type"], "image/jpeg");

  const { id: buyerId } = (
    await app.inject({ method: "POST", url: "/buyers", payload: { name: "SF Design Co", email: "hi@example.com" } })
  ).json();
  const purchase = await app.inject({ method: "POST", url: "/licenses", payload: { buyerId, photoId } });
  assert.equal(purchase.statusCode, 201);
  const { licenseId, downloadUrl } = purchase.json();

  const download = await app.inject({ url: downloadUrl });
  assert.equal(download.statusCode, 200);
  assert.equal(await extractLicense(download.rawPayload), licenseId);

  const verify = (await app.inject({ method: "POST", url: "/licenses/verify", ...multipart({}, download.rawPayload) })).json();
  assert.equal(verify.licensed, true);
  assert.equal(verify.buyerName, "SF Design Co");

  // 2 uploads at 1 cent each, plus 20% of the $5 sale.
  const balance = (await app.inject({ url: `/users/${userId}/balance` })).json();
  assert.equal(balance.balanceCents, 2 + 100);

  // Another buyer can't download with someone else's license.
  const stolen = await app.inject({ url: `/licenses/${licenseId}/download?buyerId=someone-else` });
  assert.equal(stolen.statusCode, 404);

  await app.close();
});

test("an unlicensed image is not reported as licensed", async () => {
  assert.equal(await extractLicense(await photo("#123456")), null);
});
