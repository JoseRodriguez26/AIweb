import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { PAYOUT_MIN_CENTS } from "./db.js";
import { PAYOUT_PROVIDERS, sendPayout, type PayoutProvider } from "./payments.js";

// ==================================================================
// ⚠️ LEGAL REVIEW: payouts (see payments.ts and docs/legal-review.md)
// ==================================================================
export function registerPayouts(app: FastifyInstance, db: DatabaseSync) {
  // Connect a payout account. In the real app the user signs in to PayPal or
  // Stripe on their own screen and we receive only an account reference.
  app.put<{ Params: { id: string }; Body: { provider?: string; account?: string } }>(
    "/users/:id/payout-account",
    async (req, reply) => {
      const { provider, account } = req.body ?? {};
      if (!userExists(db, req.params.id)) return reply.code(404).send({ error: "unknown_user" });
      if (!PAYOUT_PROVIDERS.includes(provider as PayoutProvider)) {
        return reply.code(400).send({ error: "unknown_provider", providers: PAYOUT_PROVIDERS });
      }
      if (!account || account.trim().length < 3) return reply.code(400).send({ error: "account_required" });

      db.prepare(
        `INSERT INTO payout_accounts (user_id, provider, account_ref, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider, account_ref = excluded.account_ref`,
      ).run(req.params.id, provider!, account.trim(), new Date().toISOString());
      return { provider, account: account.trim() };
    },
  );

  app.get<{ Params: { id: string } }>("/users/:id/payout-account", async (req, reply) => {
    const row = db
      .prepare("SELECT provider, account_ref AS account FROM payout_accounts WHERE user_id = ?")
      .get(req.params.id);
    return row ?? reply.code(404).send({ error: "no_payout_account" });
  });

  // Cash out the whole balance once it reaches the minimum.
  app.post<{ Params: { id: string } }>("/users/:id/cashout", async (req, reply) => {
    const userId = req.params.id;
    if (!userExists(db, userId)) return reply.code(404).send({ error: "unknown_user" });
    const account = db
      .prepare("SELECT provider, account_ref FROM payout_accounts WHERE user_id = ?")
      .get(userId) as { provider: PayoutProvider; account_ref: string } | undefined;
    if (!account) return reply.code(400).send({ error: "no_payout_account" });

    const { cents } = db
      .prepare("SELECT COALESCE(SUM(cents), 0) AS cents FROM ledger WHERE user_id = ?")
      .get(userId) as { cents: number };
    if (cents < PAYOUT_MIN_CENTS) {
      return reply.code(400).send({ error: "below_minimum", balanceCents: cents, minCents: PAYOUT_MIN_CENTS });
    }

    const result = await sendPayout(account.provider, account.account_ref, cents);
    const id = randomUUID();
    const now = new Date().toISOString();
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO payouts (id, user_id, cents, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id,
        userId,
        cents,
        account.provider,
        result.status,
        now,
      );
      if (result.status !== "failed") {
        db.prepare("INSERT INTO ledger (user_id, cents, reason, created_at) VALUES (?, ?, 'payout', ?)").run(
          userId,
          -cents,
          now,
        );
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return reply.code(201).send({ payoutId: id, cents, provider: account.provider, status: result.status });
  });

  app.get<{ Params: { id: string } }>("/users/:id/payouts", async (req) => {
    const payouts = db
      .prepare("SELECT id, cents, provider, status, created_at AS createdAt FROM payouts WHERE user_id = ? ORDER BY created_at DESC")
      .all(req.params.id);
    return { minCents: PAYOUT_MIN_CENTS, payouts };
  });
}

function userExists(db: DatabaseSync, id: string) {
  return Boolean(db.prepare("SELECT 1 FROM users WHERE id = ?").get(id));
}
