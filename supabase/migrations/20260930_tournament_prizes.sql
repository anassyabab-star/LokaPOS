-- Prizes shown on the tournament landing page: [{ "title": "Champion", "value": "RM300 + trophy" }, …]
-- Manual migration. Safe to re-run. The app works without it (no prize card).
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prizes JSONB NOT NULL DEFAULT '[]'::jsonb;
