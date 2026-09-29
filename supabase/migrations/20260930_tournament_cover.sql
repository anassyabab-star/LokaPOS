-- Poster / cover image for the tournament landing page and share preview.
-- Manual migration. Safe to re-run. The app works without it (no poster).
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS cover_url TEXT;
