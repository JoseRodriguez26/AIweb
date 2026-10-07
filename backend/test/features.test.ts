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

function multipart(fields: Record<string, string>, file: Buffer, type = "image/jpeg") {
  const boundary = "----aiwebtest";
  const parts = Object.entries(fields).map(
    ([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
  );
  const body = Buffer.concat([
    Buffer.from(parts.join("")),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="f"\r\nContent-Type: ${type}\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function newUser(app: ReturnType<typeof setup>) {
  return (await app.inject({ method: "POST", url: "/users" })).json().id as string;
}

async function upload(app: ReturnType<typeof setup>, userId: string, n: number, source = "phone") {
  return app.inject({
    method: "POST",
    url: "/photos",
    ...multipart(
      { userId, description: `Street corner photo ${n}`, lat: "37.77", lng: "-122.42", locationConsent: "true", termsAccepted: "true", source },
      Buffer.from(`photo-${n}`),
    ),
  });
}

test("features endpoint lists the switches", async () => {
  const app = setup();
  const f = (await app.inject({ url: "/features" })).json();
  assert.deepEqual(Object.keys(f).sort(), ["glassesCapture", "incidentReports", "marketplace", "payouts"]);
  await app.close();
});

test("glasses photos are accepted and earn like phone photos", async () => {
  const app = setup();
  const userId = await newUser(app);
  const res = await upload(app, userId, 1, "glasses");
  assert.equal(res.statusCode, 201);
  assert.equal((await upload(app, userId, 2, "drone")).statusCode, 400);
  await app.close();
});

test("cash out needs a payout account and the $5 minimum", async () => {
  const app = setup();
  const userId = await newUser(app);
  await upload(app, userId, 1);

  const noAccount = await app.inject({ method: "POST", url: `/users/${userId}/cashout` });
  assert.equal(noAccount.json().error, "no_payout_account");

  const connect = await app.inject({
    method: "PUT",
    url: `/users/${userId}/payout-account`,
    payload: { provider: "paypal", account: "me@example.com" },
  });
  assert.equal(connect.statusCode, 200);

  const tooLow = await app.inject({ method: "POST", url: `/users/${userId}/cashout` });
  assert.equal(tooLow.json().error, "below_minimum");

  for (let i = 2; i <= 500; i++) await upload(app, userId, i);
  const cashout = await app.inject({ method: "POST", url: `/users/${userId}/cashout` });
  assert.equal(cashout.statusCode, 201);
  assert.equal(cashout.json().cents, 500);

  const balance = (await app.inject({ url: `/users/${userId}/balance` })).json();
  assert.equal(balance.balanceCents, 0);
  await app.close();
});

test("incident reports are private, unpaid and not searchable", async () => {
  const app = setup();
  const userId = await newUser(app);
  const res = await app.inject({
    method: "POST",
    url: "/incidents",
    ...multipart({ userId, note: "Car break-in on Valencia St", lat: "37.76", lng: "-122.42" }, Buffer.from("video"), "video/mp4"),
  });
  assert.equal(res.statusCode, 201);
  const { id } = res.json();

  assert.equal((await app.inject({ url: `/incidents/${id}/file?userId=${userId}` })).statusCode, 200);
  assert.equal((await app.inject({ url: `/incidents/${id}/file?userId=someone-else` })).statusCode, 404);
  assert.equal((await app.inject({ url: "/search?q=valencia" })).json().results.length, 0);
  assert.equal((await app.inject({ url: `/users/${userId}/balance` })).json().balanceCents, 0);
  await app.close();
});
