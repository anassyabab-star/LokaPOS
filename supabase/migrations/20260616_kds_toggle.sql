-- ============================================================================
-- LokaPOS — Kitchen Display (KDS) flow toggle.
--
-- Adds a global on/off switch for the kitchen flow. When false (the default),
-- orders skip the kitchen queue and land "completed" the moment they are paid.
-- The KDS code/page is kept intact so the flow can be re-enabled any time by
-- flipping this flag (admin Settings → Kitchen Display).
--
-- NOTE: the app already treats a MISSING value as disabled, so the skip-kitchen
-- behaviour is live even before this migration runs. Apply this only to expose
-- the on/off toggle (needed to turn the kitchen flow back ON later).
-- ============================================================================

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS kds_enabled BOOLEAN NOT NULL DEFAULT false;
