-- Add DP (Defensive Player) position slots to leagues table
ALTER TABLE public.leagues 
ADD COLUMN IF NOT EXISTS dp_slots INTEGER NOT NULL DEFAULT 0;

-- Add DP position slots to league_settings table
ALTER TABLE public.league_settings 
ADD COLUMN IF NOT EXISTS dp_slots INTEGER NOT NULL DEFAULT 0;

