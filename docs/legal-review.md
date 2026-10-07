# Legal review checklist

Every feature below is built and working in **test mode**, and each is marked so it's easy to find:

- In the code, search for `LEGAL REVIEW`.
- In the app, each one shows a yellow **⚠️ Needs legal review** banner.
- Each one can be switched off without touching the code (see "Switching features off" below).

Go through this list with a lawyer before launch and decide which features to keep.

| Feature | Where in the code | Questions for the lawyer |
|---|---|---|
| **Photo rights through the terms** | `backend/src/server.ts` (upload), `app/src/screens/EarnScreen.tsx` | Should users transfer the copyright, or give a broad license that allows resale? Is 1¢ as the only payment enforceable and fair under consumer law? What do users need to actively accept (a checkbox at sign-up)? Moral rights in Europe. |
| **Marketplace (selling licenses)** | `backend/src/marketplace.ts`, `app/src/screens/MarketScreen.tsx` | Standard and extended license terms for buyers. Model releases for recognizable people. Trademarks and buildings in photos. Should faces be blurred or should those photos be banned from sale? |
| **Charging buyers** | `backend/src/payments.ts` (`chargeBuyer`) | Use Stripe Checkout. Sales tax or VAT on digital goods in each buyer's country. Refund policy. |
| **Paying users worldwide** | `backend/src/payments.ts` (`sendPayout`), `backend/src/payouts.ts`, `app/src/screens/WalletScreen.tsx` | Money must move through a licensed provider (PayPal Payouts, Stripe Connect). Identity checks, tax forms (W-9 / W-8BEN, 1099), sanctioned countries, minimum age. |
| **Incident reports** | `backend/src/incidents.ts`, `app/src/screens/ReportScreen.tsx` | Evidence handling and how long to keep reports. Victims' privacy. Audio-recording consent (California and about a dozen other states need everyone's consent). Liability if a user puts themselves in danger. Never pay for or sell this footage. |
| **Smart-glasses capture** | `backend/src/features.ts`, `backend/src/server.ts`, `app/src/screens/EarnScreen.tsx` | Photographing people who may not notice. Venue recording bans. Biometric laws (Illinois BIPA, Texas). GDPR in Europe. Capture light and face blurring requirements. |
| **Location data** | `app/src/location.ts`, `backend/src/server.ts` | Privacy policy for precise location (CCPA in California, GDPR in Europe). Whether to blur or round exact positions in public search. |

## Switching features off

Set any of these to `false` before starting the backend. The app hides the matching tab automatically.

```bash
FEATURE_MARKETPLACE=false
FEATURE_PAYOUTS=false
FEATURE_INCIDENT_REPORTS=false
FEATURE_GLASSES_CAPTURE=false
```

For example: `FEATURE_INCIDENT_REPORTS=false npm run dev`
