-- Smart clock: add selfie proof + GPS location to staff clock in/out.
-- Selfie images are stored in the public storage bucket `staff-selfies`;
-- these columns hold the resulting public URL. Location is "lat,lng".
-- Run this manually in the Supabase SQL editor.

alter table public.staff_clockins
  add column if not exists clock_in_selfie   text,
  add column if not exists clock_out_selfie  text,
  add column if not exists clock_in_location  text,
  add column if not exists clock_out_location text;
