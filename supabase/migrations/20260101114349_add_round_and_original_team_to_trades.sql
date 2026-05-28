-- Add round and original_team_id to pick_trades table
-- This allows trades to be tracked by round/team rather than specific pick ID
-- which makes them resilient to draft order changes

ALTER TABLE public.pick_trades
ADD COLUMN IF NOT EXISTS round INTEGER,
ADD COLUMN IF NOT EXISTS original_team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS year INTEGER;

-- Backfill existing trades with round and original_team_id from draft_picks
UPDATE public.pick_trades pt
SET 
  round = dp.round,
  original_team_id = dp.original_team_id,
  year = dp.year
FROM public.draft_picks dp
WHERE pt.draft_pick_id = dp.id
  AND (pt.round IS NULL OR pt.original_team_id IS NULL OR pt.year IS NULL);

-- Make draft_pick_id nullable since we can now find picks by round/original_team_id/year
-- (The previous migration already made it nullable, but this ensures it)
ALTER TABLE public.pick_trades
ALTER COLUMN draft_pick_id DROP NOT NULL;


