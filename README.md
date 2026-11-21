# Profence Tracker

Track where every inventory / purchase-order item is stored in the office, print a QR label for it, and find it again by searching.

## Features

- **Office locations**: add every storage place (shelves, bays, rooms) in bulk.
- **Inventory orders**: PO number, item, description, optional photo, and the office location (picked from pills).
- **QR labels**: generate a QR code with the PO number underneath; download or print it. Scanning opens the order page.
- **Search**: any part of the PO number, item, description or location, with location filters and 30-per-page pagination.
- Light / dark / match-device theme.

## Tech

Next.js (App Router) · Firebase Firestore (photos are compressed and stored in Firestore, so the free Spark plan works) · deployed on Vercel.

## Local development

1. Copy `.env.example` to `.env.local` and fill in your Firebase web app config
   (Firebase console → Project settings → Your apps → Web app).
2. `npm install`
3. `npm run dev` and open http://localhost:3000

## Firestore rules

The app has no login, so the rules in [`firestore.rules`](firestore.rules) allow anyone with the link to read and write, but only data in the expected shape and size. Publish them in the Firebase console (Firestore → Rules) after any change.

## Deploying (Vercel)

Add the six `NEXT_PUBLIC_FIREBASE_*` variables from `.env.example` to the Vercel project's Environment Variables, then deploy. Pushes to `main` deploy automatically once the GitHub repo is connected.
