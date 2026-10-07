// Feature switches. Every feature marked LEGAL REVIEW can be turned off here
// (or with an environment variable) until a lawyer has signed off on it.
// Full checklist: docs/legal-review.md

function flag(envName: string, defaultOn: boolean) {
  const v = process.env[envName];
  return v === undefined ? defaultOn : v === "true" || v === "1";
}

export const FEATURES = {
  // ==================================================================
  // ⚠️ LEGAL REVIEW: selling licenses to photos
  // Copyright transfer or sublicensing via the terms, model releases for
  // recognizable people, trademarks in photos, license terms for buyers.
  // ==================================================================
  marketplace: flag("FEATURE_MARKETPLACE", true),

  // ==================================================================
  // ⚠️ LEGAL REVIEW: paying users (money transmission, KYC, tax forms)
  // Payouts must go through a licensed provider (PayPal, Stripe, ...).
  // ==================================================================
  payouts: flag("FEATURE_PAYOUTS", true),

  // ==================================================================
  // ⚠️ LEGAL REVIEW: incident reports (filming crimes)
  // Evidence handling, victims' privacy, audio-recording consent laws.
  // Never paid, never sold, never searchable.
  // ==================================================================
  incidentReports: flag("FEATURE_INCIDENT_REPORTS", true),

  // ==================================================================
  // ⚠️ LEGAL REVIEW: smart-glasses capture
  // Photographing people without them noticing, venue recording bans,
  // biometric laws (Illinois BIPA), GDPR in Europe.
  // ==================================================================
  glassesCapture: flag("FEATURE_GLASSES_CAPTURE", true),
};

export type FeatureName = keyof typeof FEATURES;
