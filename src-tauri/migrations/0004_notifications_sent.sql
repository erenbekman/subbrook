CREATE TABLE notifications_sent (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  due_date        TEXT    NOT NULL,
  kind            TEXT    NOT NULL CHECK (kind IN ('renewal', 'trial')),
  sent_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subscription_id, due_date, kind)
);
