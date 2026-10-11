-- Subbrook schema v1. Money is stored as integer minor units (kuruş/cents) to avoid float drift.
-- Dates are ISO 'YYYY-MM-DD' text; SQLite compares them correctly as strings.

CREATE TABLE categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL UNIQUE,
  color     TEXT    NOT NULL,            -- design token key: cat-1 … cat-6
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payment_methods (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,            -- "Card ending 4417", "Apple ID balance"
  kind  TEXT NOT NULL DEFAULT 'card'     -- card | wallet | bank | other
);

CREATE TABLE subscriptions (
  id                INTEGER PRIMARY KEY,
  name              TEXT    NOT NULL,
  category_id       INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
  amount_minor      INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency          TEXT    NOT NULL DEFAULT 'TRY',
  interval_unit     TEXT    NOT NULL DEFAULT 'month' CHECK (interval_unit IN ('day','week','month','year')),
  interval_count    INTEGER NOT NULL DEFAULT 1 CHECK (interval_count >= 1),
  start_date        TEXT    NOT NULL,
  next_due          TEXT    NOT NULL,
  trial_ends        TEXT,
  status            TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled','archived')),
  share_count       INTEGER NOT NULL DEFAULT 1 CHECK (share_count >= 1),
  usage_per_month   REAL,                -- 30 daily, 4.3 weekly, 1 monthly, 0.3 rarely
  website           TEXT,
  account           TEXT,
  cancel_url        TEXT,
  commitment_ends   TEXT,
  notes             TEXT,
  reminder_days     INTEGER NOT NULL DEFAULT 3,
  reminder_time     TEXT    NOT NULL DEFAULT '09:00',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_subscriptions_next_due ON subscriptions(next_due);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE subscription_tags (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (subscription_id, tag_id)
);

-- Price history: one row per price, effective from a date.
CREATE TABLE price_changes (
  id              INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount_minor    INTEGER NOT NULL,
  currency        TEXT    NOT NULL,
  effective_date  TEXT    NOT NULL
);

-- Charges that actually happened (or were refunded / skipped).
CREATE TABLE payments (
  id              INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  due_date        TEXT    NOT NULL,
  amount_minor    INTEGER NOT NULL,
  currency        TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded','skipped')),
  recorded_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_sub ON payments(subscription_id, due_date);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO categories (name, color, position) VALUES
  ('AI', 'cat-1', 1),
  ('Cloud', 'cat-2', 2),
  ('Dev tools', 'cat-3', 3),
  ('Entertainment', 'cat-4', 4),
  ('Music', 'cat-5', 5),
  ('Education', 'cat-6', 6);

INSERT INTO settings (key, value) VALUES ('currency', 'TRY'), ('theme', 'system');
