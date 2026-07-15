-- Reset returns the league to pre-initialization (no draft_picks rows)

CREATE OR REPLACE FUNCTION public.reset_draft_board(
  p_league_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM now())::INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only the league admin can reset the draft board';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE id = p_league_id) THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  -- Removes picks (and cascading pick_trades) so the board is uninitialized again
  DELETE FROM public.draft_picks
  WHERE league_id = p_league_id
    AND year = p_year;

  UPDATE public.leagues
  SET
    draft_status = 'not_started',
    current_pick = 1,
    current_round = 1,
    updated_at = now()
  WHERE id = p_league_id;
END;
$$;
