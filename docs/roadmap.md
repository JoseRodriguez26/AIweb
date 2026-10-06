# Roadmap

## Phase 1: Collect (this scaffold)
- [x] Upload a photo with description and location
- [x] Location consent required before a photo is accepted
- [x] Exact duplicate rejection (SHA-256 of the file)
- [x] 1 cent credited per accepted photo
- [x] Basic keyword + distance search
- [ ] User sign-in (phone number or email)
- [ ] In-app camera only (no gallery picks)

## Phase 1b: Marketplace (this scaffold)
- [x] Selling rights come from the terms of service; every accepted photo is for sale
- [x] Buyers browse photos by keyword and area, with marked previews
- [x] License purchase with 20% to the photographer
- [x] Invisible license ID in each sold copy, plus a verify endpoint
- [ ] Real payments (Stripe Checkout)
- [ ] Robust watermark or C2PA content credentials
- [ ] License terms and buyer sign-in

## Phase 2: Trust
- [ ] Near-duplicate detection (perceptual hash)
- [ ] Face and license plate blurring
- [ ] Daily earning caps and review queue
- [ ] Payout threshold and payout provider (Stripe Connect or PayPal)
- [ ] Terms of service and privacy policy

## Phase 3: Search for everyone
- [ ] Image and text embeddings for every photo
- [ ] Vector index for "find photos like this" and natural-language search
- [ ] Map view of results
- [ ] Search inside the app for contributors

## Phase 4: AI
- [ ] Train or fine-tune models on accepted photos
- [ ] Answer questions about places ("is this park crowded right now?")
- [ ] Data access for businesses as a revenue source
