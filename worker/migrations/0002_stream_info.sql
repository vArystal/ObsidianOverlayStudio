-- CP24: broadcast title, category, live state and start time, as reported by Kick.
-- Nullable and additive: existing rows keep advertising "not reported" until Kick sends an event.
ALTER TABLE connections ADD COLUMN stream_info TEXT;
