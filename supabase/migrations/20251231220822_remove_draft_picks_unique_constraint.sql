-- Remove the unique constraint on (league_id, round, original_team_id, year)
-- This allows more flexible draft pick management without duplicate key errors
ALTER TABLE public.draft_picks 
DROP CONSTRAINT IF EXISTS draft_picks_league_id_round_original_team_id_year_key;


