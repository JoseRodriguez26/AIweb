# AIweb

A phone app where people photograph the real world, describe what they see, tag where it is, and get paid **1 cent per accepted photo**. Every upload becomes training data for an AI-powered search engine of the physical world, and the same people who contribute the data will be able to search it.

## How it works

1. **Capture.** The user takes a photo in the app.
2. **Describe.** They add a short description ("taco truck on Mission St, open late").
3. **Locate.** The app attaches GPS location, but only after the user has granted location consent.
4. **Upload.** The backend checks the photo (duplicate, missing description, bad location) and accepts or rejects it.
5. **Get paid.** Each accepted photo credits $0.01 to the user's balance. Payouts happen once the balance passes a minimum threshold.
6. **Sell.** Under the app's terms, AIweb holds the rights to every uploaded photo, so businesses can buy a commercial license for the photo (for example, a fresh Golden Gate Bridge shot instead of a stock photo). The app keeps the full sale price, and every sold copy carries an invisible watermark with its license ID. See [docs/marketplace.md](docs/marketplace.md).
7. **Search.** Accepted photos and their descriptions are indexed so anyone can search ("coffee shops near Union Square", "flooded streets today"). Later, an AI model trained on this data makes the search smarter.

## Repository layout

```
app/       Mobile app (Expo / React Native, TypeScript): capture, describe, locate, upload
backend/   API server (Node.js, Fastify, TypeScript, SQLite): uploads, earnings, search
docs/      Product notes, including an honest review of the idea and the roadmap
```

## Stack

| Part    | Choice | Why |
|---------|--------|-----|
| App     | Expo (React Native + TypeScript) | One codebase for iPhone and Android, built-in camera and location modules |
| Backend | Node.js 22 + Fastify + TypeScript | Simple, fast, same language as the app |
| Images  | sharp | Previews and the invisible license watermark |
| Storage | SQLite (built into Node 22) + local disk for images | Zero setup to start; swap for Postgres + S3-style storage when real users arrive |
| Search  | Keyword + distance search today | Replace with image/text embeddings and a vector index once there is data |

## Running it

Backend:

```bash
cd backend
npm install
npm run dev      # http://localhost:3000
npm test
```

App:

```bash
cd app
npm install
npx expo start   # scan the QR code with the Expo Go app on your phone
```

Set `EXPO_PUBLIC_API_URL` to your computer's LAN address (for example `http://192.168.1.20:3000`) so the phone can reach the backend.

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
