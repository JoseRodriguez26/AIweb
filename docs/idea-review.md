# Idea review: pay people a penny per photo to build a real-world search engine

## Short answer

Yes, it makes sense as a direction. Fresh, ground-truth, location-tagged photos are valuable, and today's search engines and AI models are weak at "what does this place look like right now". The hard part is not the app, it is keeping the data honest and the economics working.

## Strengths

- **Fresh, real-world data.** Web search knows what was posted online. This would know what is physically there today.
- **Contributors are also users.** People who upload have a reason to come back and search, which helps growth.
- **Simple to understand.** "Take a picture, earn a penny" needs no explanation.
- **Data has buyers.** Labeled, geotagged images are useful for AI training, mapping, retail, insurance and local businesses, so there are ways to earn money beyond search ads.

## Main challenges

### 1. Payouts cost more than a penny
Sending $0.01 costs more than $0.01 with almost any payment provider. Fix: keep a balance in the app and pay out only past a threshold (for example $5 via PayPal, Stripe Connect or gift cards). You will also need tax and identity handling once someone earns enough (in the US, reporting kicks in at certain yearly totals).

### 2. Fraud and junk photos
If photos pay, people will upload duplicates, screenshots, photos of a screen, the same wall 500 times, or AI-generated images. Defenses, roughly in order of effort:
- Exact duplicate check with a file hash (already in this scaffold).
- Near-duplicate check with a perceptual hash.
- Only allow photos taken in the app camera, not picked from the gallery.
- Compare the phone's GPS and the time of capture with the upload.
- Daily earning caps per user and per location.
- Spot checks and an AI quality filter before a photo pays.

### 3. Privacy and consent
- **Location** must be opt-in, and the app should explain why it is needed.
- **Faces and license plates** in photos of public places need blurring before anything is made public or searchable.
- **Private places** (inside homes, schools, hospitals) should be rejected.
- **Laws** like GDPR (Europe), CCPA (California) and BIPA (Illinois, face data) apply. Talk to a lawyer before launch.

### 4. Who owns the photos
The terms of service must clearly say the user grants a license to use the photo for AI training and search. Be upfront about it; hidden terms here destroy trust.

### 5. Economics
At a penny per photo, 1 million photos cost $10,000 in payouts, plus storage and processing. You need a plan for who pays: search ads, selling data access to businesses, or a paid search tier.

### 6. Selling photos to businesses
The marketplace (see [marketplace.md](marketplace.md)) is a strong answer to "who pays", because fresh local photos are something stock sites don't have. It brings its own work: license terms, model releases for recognizable people, and a watermark that survives editing.

### 7. Cold start
Search is only useful once there are many photos in one area. Start in one city or one category (restaurants, parking, street conditions) rather than "the whole world".

## Suggested first milestone

Launch in one neighborhood with a small group of testers, a $5 payout threshold, in-app camera only, and manual review of photos. Measure how many photos are actually useful before spending on the AI part.
