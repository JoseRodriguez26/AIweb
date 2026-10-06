# Photo marketplace

Businesses, designers and creators can buy a commercial license for fresh photos of a place. Instead of a generic stock photo of the Golden Gate Bridge, a buyer gets one taken this week, by someone who was standing there.

This is a second source of income next to search, and it helps pay for the photographer payouts and the AI.

## How it works

1. **The app holds the rights.** Everyone accepts the terms of service before uploading. The terms give AIweb a permanent, worldwide right to use the photo and sell licenses for it (or transfer the copyright outright, if the lawyer recommends that). Every accepted photo is for sale. AIweb can pull one from sale with the `for_sale` flag, for example when it shows a recognizable person.
2. **Buyer browses by place.** Buyers search by keyword and area (for example "golden gate" within 3 km). They see a small preview with a visible "AIweb preview" mark.
3. **Buyer purchases.** A commercial license costs **$5.00** (`LICENSE_PRICE_CENTS`). The full amount goes to the app; the photographer was already paid 1¢ when the photo was accepted. The price is set in `backend/src/db.ts`.
4. **Buyer downloads.** The full photo is delivered as a PNG with the **license ID hidden inside it** (invisible watermark) and also written into the image's copyright metadata.
5. **Anyone can check a photo.** Uploading an image to `/licenses/verify` tells you which license it came from and who bought it, so unlicensed copies can be traced.

## API

| Method | Path | What it does |
|--------|------|--------------|
| `POST` | `/buyers` | Create a buyer account (`name`, `email`) |
| `GET`  | `/marketplace?q=&lat=&lng=&radiusKm=` | Photos for sale, by keyword and/or area |
| `GET`  | `/marketplace/photos/:id/preview` | Small preview with a visible mark |
| `POST` | `/licenses` | Buy a license (`buyerId`, `photoId`) |
| `GET`  | `/licenses/:id/download?buyerId=` | Full photo with the hidden license ID |
| `POST` | `/licenses/verify` | Upload an image, get its license back |

## Limits of this first version

- **No real payments yet.** `POST /licenses` records the sale without charging. Stripe Checkout (or similar) needs to go in before going live.
- **The hidden watermark is simple.** It survives exact copies of the file, but not cropping, resizing or JPEG re-compression. For real protection, use a robust watermarking service such as Imatag, Digimarc or Steg.AI, or the C2PA "content credentials" standard, which Adobe and others use to attach provenance to images.
- **Downloads are protected only by the buyer ID.** Real sign-in for buyers is still needed.

## Things to settle before selling photos

- **License terms.** Write a standard license (what buyers may do, for how long, print vs. web, resale not allowed). Many stock sites use a "standard" and an "extended" tier.
- **Photographer agreement.** The terms of service must clearly say what rights photographers give the app (broad sublicensable license, or copyright transfer) and that the 1¢ payment is the only payment for it. Users must actively accept them, for example with a checkbox at sign-up. Have a lawyer write them; in some countries (much of Europe) photographers keep moral rights that can't be signed away.
- **People and property.** Commercial use of a photo showing a recognizable person needs a model release; some buildings and logos are trademarked. Simplest rule to start: blur faces, and only sell photos with no identifiable people.
- **Exclusivity.** Licenses are non-exclusive: the same photo can be sold to many buyers.
