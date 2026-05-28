-- Remove the unique constraint on (league_id, year, draft_position)
-- This allows more efficient updates without conflicts
ALTER TABLE public.team_draft_positions 
DROP CONSTRAINT IF EXISTS team_draft_positions_league_id_year_draft_position_key;


