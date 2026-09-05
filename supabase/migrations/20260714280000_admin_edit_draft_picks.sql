-- Admin can change (or clear) any draft pick during or after the draft.

CREATE OR REPLACE FUNCTION public.admin_set_draft_pick_player(
  p_pick_id UUID,
  p_player_id TEXT DEFAULT NULL
)
RETURNS public.draft_picks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick public.draft_picks%ROWTYPE;
BEGIN
  SELECT * INTO v_pick FROM public.draft_picks WHERE id = p_pick_id;
  IF v_pick.id IS NULL THEN
    RAISE EXCEPTION 'Pick not found';
  END IF;

  IF NOT public.can_manage_league(v_pick.league_id) THEN
    RAISE EXCEPTION 'Only league admins can edit draft picks';
  END IF;

  IF p_player_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
      RAISE EXCEPTION 'Player not found';
    END IF;

    IF public.player_is_league_keeper(v_pick.league_id, p_player_id) THEN
      RAISE EXCEPTION 'Player is already a keeper in this league';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.draft_picks
      WHERE league_id = v_pick.league_id
        AND year = v_pick.year
        AND player_id = p_player_id
        AND id <> p_pick_id
    ) THEN
      RAISE EXCEPTION 'Player has already been drafted';
    END IF;
  END IF;

  UPDATE public.draft_picks
  SET
    player_id = p_player_id,
    picked_at = CASE WHEN p_player_id IS NULL THEN NULL ELSE now() END
  WHERE id = p_pick_id
  RETURNING * INTO v_pick;

  RETURN v_pick;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_mock_pick_player(
  p_pick_id UUID,
  p_player_id TEXT DEFAULT NULL
)
RETURNS public.mock_draft_picks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick public.mock_draft_picks%ROWTYPE;
BEGIN
  SELECT * INTO v_pick FROM public.mock_draft_picks WHERE id = p_pick_id;
  IF v_pick.id IS NULL THEN
    RAISE EXCEPTION 'Mock pick not found';
  END IF;

  IF NOT public.can_manage_league(v_pick.league_id) THEN
    RAISE EXCEPTION 'Only league admins can edit mock draft picks';
  END IF;

  IF p_player_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
      RAISE EXCEPTION 'Player not found';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.mock_draft_picks
      WHERE league_id = v_pick.league_id
        AND year = v_pick.year
        AND player_id = p_player_id
        AND id <> p_pick_id
    ) THEN
      RAISE EXCEPTION 'That player has already been picked in this mock draft';
    END IF;
  END IF;

  UPDATE public.mock_draft_picks
  SET
    player_id = p_player_id,
    picked_at = CASE WHEN p_player_id IS NULL THEN NULL ELSE now() END
  WHERE id = p_pick_id
  RETURNING * INTO v_pick;

  RETURN v_pick;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_draft_pick_player(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_mock_pick_player(UUID, TEXT) TO authenticated;
