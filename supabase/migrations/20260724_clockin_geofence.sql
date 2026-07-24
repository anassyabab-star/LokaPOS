-- Smart clock geofence: restrict staff clock in/out to the shop area.
-- Shape of clockin_geofence JSONB:
--   { "enabled": true, "lat": 3.1234, "lng": 101.5678, "radius_m": 150 }
-- When enabled, /api/pos/clockin rejects clock in/out done outside the radius
-- (and requires GPS). Run this manually in the Supabase SQL editor.

alter table public.store_settings
  add column if not exists clockin_geofence jsonb;
