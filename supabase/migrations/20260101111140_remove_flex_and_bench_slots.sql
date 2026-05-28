-- Remove flex_slots and bench_slots from leagues table
-- These aren't actual draft positions, they're configuration that gets filled with players from real positions

ALTER TABLE public.leagues 
DROP COLUMN IF EXISTS flex_slots,
DROP COLUMN IF EXISTS bench_slots;

-- Remove flex_slots and bench_slots from league_settings table
ALTER TABLE public.league_settings 
DROP COLUMN IF EXISTS flex_slots,
DROP COLUMN IF EXISTS bench_slots;


