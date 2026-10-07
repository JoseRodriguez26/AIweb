# AIweb

A phone app where people photograph the real world, describe what they see, tag where it is, and get paid **1 cent per accepted photo**. Every upload becomes training data for an AI-powered search engine of the physical world, and the same people who contribute the data will be able to search it.

## How it works

1. **Capture.** The user takes a photo in the app.
2. **Describe.** They add a short description ("taco truck on Mission St, open late").
3. **Locate.** The app attaches GPS location, but only after the user has granted location consent.
4. **Upload.** The backend checks the photo (duplicate, missing description, bad location) and accepts or rejects it.
5. **Get paid.** Each accepted photo credits $0.01 to the user's balance. Payouts happen once the balance passes a minimum threshold.
6. **Cash out.** Users connect PayPal or a bank (through Stripe) in the Wallet tab and cash out once they reach $5.
7. **Sell.** Under the app's terms, AIweb holds the rights to every uploaded photo, so businesses can buy a commercial license for the photo (for example, a fresh Golden Gate Bridge shot instead of a stock photo). The app keeps the full sale price, and every sold copy carries an invisible watermark with its license ID. See [docs/marketplace.md](docs/marketplace.md).
8. **Search.** Accepted photos and their descriptions are indexed so anyone can search ("coffee shops near Union Square", "flooded streets today"). Later, an AI model trained on this data makes the search smarter.

**Also in this version**

- **Report an incident:** a Good Samaritan mode for recording a crime or emergency. Reports stay private for sharing with police, and are never paid, sold or searchable.
- **Smart glasses:** photos can be marked as taken with glasses. Connecting real glasses (Ray-Ban Meta toolkit) is the next step.

Features that need a lawyer's approval are marked **⚠️ LEGAL REVIEW** in the code and in the app, and can each be switched off. See [docs/legal-review.md](docs/legal-review.md).

## Repository layout

```
app/       Mobile app (Expo / React Native, TypeScript): capture, describe, locate, upload
backend/   API server (Node.js, Fastify, TypeScript, SQLite): uploads, earnings, search
docs/      Product notes: idea review, marketplace, legal review checklist, roadmap
.vscode/   One-click tasks to set up, run and test from VS Code
```

## Stack

| Part    | Choice | Why |
|---------|--------|-----|
| App     | Expo (React Native + TypeScript) | One codebase for iPhone and Android, built-in camera and location modules |
| Backend | Node.js 22 + Fastify + TypeScript | Simple, fast, same language as the app |
| Images  | sharp | Previews and the invisible license watermark |
| Storage | SQLite (built into Node 22) + local disk for images | Zero setup to start; swap for Postgres + S3-style storage when real users arrive |
| Search  | Keyword + distance search today | Replace with image/text embeddings and a vector index once there is data |

## Running it on your Mac (VS Code)

You need Node.js 22 or newer (from nodejs.org).

```bash
git clone https://github.com/JoseRodriguez26/AIweb.git
cd AIweb
git checkout claude/photo-app-restructure-bunbqz
npm run setup    # installs everything, once
npm run dev      # starts the backend and opens the app in your browser
```

In VS Code you can also use **Terminal → Run Task… → Run AIweb**.

The app opens at http://localhost:8081 and the backend runs at http://localhost:3000. Press `Ctrl+C` in the terminal to stop both.

**On your phone:** install the free Expo Go app, make sure the phone and Mac are on the same Wi-Fi, then use **Run Task… → Run AIweb on my phone** and scan the QR code.

**Tests:** `npm test`

Everything that involves money runs in **test mode**: no card is charged and no payout is sent.

## API (first version)

| Method | Path | What it does |
|--------|------|--------------|
| `POST` | `/users` | Create a user, returns `id` |
| `POST` | `/photos` | Multipart upload: `photo` file plus `userId`, `description`, `lat`, `lng`, `locationConsent`, `termsAccepted` |
| `GET`  | `/users/:id/balance` | Accepted photos and earnings in cents |
| `GET`  | `/search?q=...&lat=...&lng=...&radiusKm=...` | Search photos by words in the description, optionally near a point |
| `GET`  | `/photos/:id/image` | The image file |

Marketplace endpoints (buyers, previews, licenses, watermark check) are listed in [docs/marketplace.md](docs/marketplace.md).

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). The short version: get real people uploading in one city, prove photos are useful and not fake, then build the AI search on top.

## Is this a good idea?

See [docs/idea-review.md](docs/idea-review.md) for strengths and the hard problems (payouts, fraud, privacy, legal).

---

**Made in San Francisco, for the world.**
