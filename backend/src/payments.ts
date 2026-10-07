import { randomUUID } from "node:crypto";

// Money in and money out. Both run in TEST MODE: nothing is charged and
// nothing is sent. Swap these two functions for real provider calls.

// ==================================================================
// ⚠️ LEGAL REVIEW: charging buyers
// Use Stripe Checkout so card data never touches this server.
// Sales tax / VAT on digital goods depends on the buyer's country.
// ==================================================================
export async function chargeBuyer(_buyerId: string, _cents: number): Promise<{ ok: boolean; ref: string }> {
  return { ok: true, ref: `test_charge_${randomUUID()}` };
}

// ==================================================================
// ⚠️ LEGAL REVIEW: paying users worldwide
// Sending money is regulated (money transmission, anti-money-laundering,
// sanctions). A licensed provider must do it: PayPal Payouts or Stripe
// Connect. They also verify identity and collect tax forms (W-9 / W-8BEN).
// ==================================================================
export const PAYOUT_PROVIDERS = ["paypal", "stripe"] as const;
export type PayoutProvider = (typeof PAYOUT_PROVIDERS)[number];

export async function sendPayout(
  _provider: PayoutProvider,
  _accountRef: string,
  _cents: number,
): Promise<{ status: "pending" | "failed" }> {
  return { status: "pending" };
}
