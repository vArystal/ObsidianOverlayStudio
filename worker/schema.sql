-- Cloudflare D1 schema for the Obsidian Overlay Studio Kick backend.
-- Apply with: wrangler d1 execute obsidian-overlay --remote --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS connections (
  id                     TEXT PRIMARY KEY,
  account_user_id        INTEGER UNIQUE,
  account_username       TEXT,
  account_avatar         TEXT,
  channel_slug           TEXT,
  channel_description    TEXT,
  active_subscribers     INTEGER,
  tokens                 TEXT NOT NULL,          -- AES-GCM sealed JSON, never plaintext
  management_hash        TEXT,                   -- sha256 of the browser management token
  runtime_key            TEXT UNIQUE,             -- stable key for overlays that are not published yet
  scopes                 TEXT NOT NULL DEFAULT '[]',
  subscriptions          TEXT NOT NULL DEFAULT '[]',
  webhook_error          TEXT,
  connected              INTEGER NOT NULL DEFAULT 1,
  viewer                 TEXT NOT NULL DEFAULT '{"status":"unavailable","count":null,"updatedAt":null}',
  last_follower          TEXT,
  session_follower_count INTEGER NOT NULL DEFAULT 0,
  last_event_at          TEXT,
  last_event_type        TEXT,
  last_chat_user         TEXT,
  -- Durable per-type receipt counters. Event rows are pruned after an hour, so without
  -- this there is no way to prove later whether a real delivery ever arrived.
  event_counts           TEXT NOT NULL DEFAULT '{}',
  updated_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_connections_management ON connections(management_hash);

CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  verifier   TEXT NOT NULL,
  return_to  TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS exchanges (
  code             TEXT PRIMARY KEY,
  connection_id    TEXT NOT NULL,
  management_token TEXT NOT NULL,
  expires_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS publications (
  id            TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  overlay_id    TEXT NOT NULL,
  runtime_key   TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publications_connection ON publications(connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_publications_overlay ON publications(connection_id, overlay_id);

CREATE TABLE IF NOT EXISTS events (
  seq           INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL,
  runtime_key   TEXT NOT NULL,
  message_id    TEXT NOT NULL,
  type          TEXT NOT NULL,
  payload       TEXT NOT NULL,
  received_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_runtime ON events(runtime_key, seq);
CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);

CREATE TABLE IF NOT EXISTS processed (
  message_id TEXT PRIMARY KEY,
  at         TEXT NOT NULL
);
