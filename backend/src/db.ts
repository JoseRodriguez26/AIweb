import { DatabaseSync } from "node:sqlite";

// Pay rate for every accepted photo, in US cents.
export const CENTS_PER_PHOTO = 1;

// Marketplace: what a buyer pays for a commercial license. The full amount goes to the app;
// the photographer was already paid 1 cent when the photo was accepted.
export const LICENSE_PRICE_CENTS = 500;

// Users can cash out once their balance reaches this amount. Sending single
// pennies would cost more in fees than the penny itself.
export const PAYOUT_MIN_CENTS = 500;

export type Photo = {
  id: string;
  userId: string;
  description: string;
  lat: number;
  lng: number;
  sha256: string;
  filePath: string;
  createdAt: string;
};

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      description TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      sha256 TEXT NOT NULL UNIQUE,
      file_path TEXT NOT NULL,
      -- Every upload is sellable under the terms of service. Set to 0 to pull a
      -- photo from sale (for example, it shows a recognizable person).
      for_sale INTEGER NOT NULL DEFAULT 1,
      -- 'phone' or 'glasses'
      source TEXT NOT NULL DEFAULT 'phone',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS buyers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- One row per sold copy. The id is hidden in the delivered image.
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      photo_id TEXT NOT NULL REFERENCES photos(id),
      buyer_id TEXT NOT NULL REFERENCES buyers(id),
      price_cents INTEGER NOT NULL,
      payment_ref TEXT,
      created_at TEXT NOT NULL
    );

    -- Where a user gets paid. Only the provider's account reference is stored,
    -- never bank details.
    CREATE TABLE IF NOT EXISTS payout_accounts (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      provider TEXT NOT NULL,
      account_ref TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      cents INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Incident reports are kept apart from photos: never paid, sold or searchable.
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      file_path TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      lat REAL,
      lng REAL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    -- Every credit or payout is a row, so balances can always be audited.
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      photo_id TEXT REFERENCES photos(id),
      cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}
