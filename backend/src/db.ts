import { DatabaseSync } from "node:sqlite";

// Pay rate for every accepted photo, in US cents.
export const CENTS_PER_PHOTO = 1;

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
