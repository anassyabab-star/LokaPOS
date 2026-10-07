-- Tournament screens now poll a CDN-cached endpoint every 5s instead of
-- Supabase Realtime. The project's 1 GB instance was over-committed and
-- swapping (Disk IO budget warnings); Realtime's continuous WAL reading for
-- these tables is a cost we no longer need.
--
-- Manual migration. Safe to re-run. To bring Realtime back, re-add the
-- tables (see 20260929_tournament.sql).

DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['tournament_matches', 'tournament_announcements', 'tournaments'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- What's still published (expect no tournament tables):
SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
