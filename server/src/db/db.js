import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "app.db");

const db = new Database(DB_PATH);

// WAL mode gives better concurrent read/write behavior for this workload.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
// busy_timeout makes concurrent writers wait briefly instead of failing
// immediately with SQLITE_BUSY -- important for the concurrent seat-hold test.
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','organiser','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  layout TEXT NOT NULL, -- JSON: [{ rowLabel, category, seatCount }]
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organiser_id TEXT NOT NULL REFERENCES users(id),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'movie', -- movie | concert
  date_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLISHED', -- PUBLISHED | CANCELLED
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_categories (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,
  price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  category_id TEXT NOT NULL REFERENCES event_categories(id),
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  label TEXT NOT NULL, -- e.g. A5
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','HELD','BOOKED')),
  UNIQUE(event_id, label)
);

CREATE TABLE IF NOT EXISTS holds (
  id TEXT PRIMARY KEY,
  seat_id TEXT NOT NULL REFERENCES seats(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','CONVERTED','RELEASED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  booking_ref TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','CANCELLED')),
  total_amount REAL NOT NULL,
  qr_code TEXT, -- data URL
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_seats (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  seat_id TEXT NOT NULL REFERENCES seats(id),
  price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  category_id TEXT NOT NULL REFERENCES event_categories(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING','OFFERED','CONFIRMED','EXPIRED','CANCELLED')),
  offer_seat_id TEXT REFERENCES seats(id),
  offer_expires_at TEXT,
  position_hint INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, category_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_seats_event ON seats(event_id);
CREATE INDEX IF NOT EXISTS idx_holds_seat ON holds(seat_id);
CREATE INDEX IF NOT EXISTS idx_holds_status ON holds(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_queue ON waitlist(event_id, category_id, status, created_at);
`);

export default db;
