-- Reliable mock picks via SECURITY DEFINER (avoids RLS update/.select() edge cases)

CREATE OR REPLACE FUNCTION public.make_mock_pick(
  p_pick_id UUID,
  p_player_id TEXT
)
RETURNS public.mock_draft_picks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick public.mock_draft_picks%ROWTYPE;
BEGIN
  SELECT * INTO v_pick
  FROM public.mock_draft_picks
  WHERE id = p_pick_id;

  IF v_pick.id IS NULL THEN
    RAISE EXCEPTION 'Mock pick not found';
  END IF;

  IF NOT public.can_manage_league(v_pick.league_id) THEN
    RAISE EXCEPTION 'Only league admins can make mock draft picks';
  END IF;

  IF v_pick.player_id IS NOT NULL THEN
    RAISE EXCEPTION 'That mock pick has already been made';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mock_draft_picks
    WHERE league_id = v_pick.league_id
      AND year = v_pick.year
      AND player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'That player has already been picked in this mock draft';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  UPDATE public.mock_draft_picks
  SET
    player_id = p_player_id,
    picked_at = now()
  WHERE id = p_pick_id
  RETURNING * INTO v_pick;

  RETURN v_pick;
END;
$$;

GRANT EXECUTE ON FUNCTION public.make_mock_pick(UUID, TEXT) TO anon, authenticated;

-- Ensure UPDATE policy has an explicit WITH CHECK
DROP POLICY IF EXISTS "League admin can update mock draft picks" ON public.mock_draft_picks;
CREATE POLICY "League admin can update mock draft picks"
  ON public.mock_draft_picks FOR UPDATE
  USING (public.can_manage_league(league_id))
  WITH CHECK (public.can_manage_league(league_id));
