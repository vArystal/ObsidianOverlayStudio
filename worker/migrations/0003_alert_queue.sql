-- CP25: durable alert queue state.
-- Alert webhooks themselves already live in `events`; what was missing is what the overlay has actually shown,
-- so a reload cannot replay it, and where test frames live so they never touch production rows.

-- One row per (runtime, event) the overlay has finished playing. Insert-or-ignore makes acks idempotent.
CREATE TABLE IF NOT EXISTS alert_acks (
  runtime_key TEXT NOT NULL,
  message_id  TEXT NOT NULL,
  acked_at    TEXT NOT NULL,
  PRIMARY KEY (runtime_key, message_id)
);
CREATE INDEX IF NOT EXISTS idx_alert_acks_time ON alert_acks(acked_at);

-- Milestone targets the streamer configured, stored per runtime so webhook ingestion can emit a derived alert
-- from durable counters instead of guessing at a total.
CREATE TABLE IF NOT EXISTS alert_settings (
  runtime_key TEXT PRIMARY KEY,
  settings    TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Test frames are ephemeral by design: they expire in minutes, they are never selected by the production feed,
-- and they are never counted. A test can therefore reach an OBS source without contaminating live data.
CREATE TABLE IF NOT EXISTS alert_test_frames (
  id          TEXT PRIMARY KEY,
  runtime_key TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_test_frames ON alert_test_frames(runtime_key, created_at);
