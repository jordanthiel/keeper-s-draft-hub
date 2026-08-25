-- Prevent drafting a player who is already on any team's keeper list in the league.

CREATE OR REPLACE FUNCTION public.player_is_league_keeper(
  p_league_id UUID,
  p_player_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.keepers k
    JOIN public.teams t ON t.id = k.team_id
    WHERE t.league_id = p_league_id
      AND k.player_id = p_player_id
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_drafting_keepers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.player_id IS NOT NULL
     AND NEW.player_id IS DISTINCT FROM OLD.player_id
     AND public.player_is_league_keeper(NEW.league_id, NEW.player_id) THEN
    RAISE EXCEPTION 'Player is already a keeper in this league';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS draft_picks_no_keepers ON public.draft_picks;
CREATE TRIGGER draft_picks_no_keepers
  BEFORE UPDATE OF player_id ON public.draft_picks
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_drafting_keepers();

-- Clearer error from the team-code pick path
CREATE OR REPLACE FUNCTION public.make_pick_with_code(
  p_pick_id UUID,
  p_player_id TEXT,
  p_access_code TEXT DEFAULT NULL
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

  IF v_pick.player_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pick already made';
  END IF;

  IF public.can_manage_league(v_pick.league_id) THEN
    NULL;
  ELSIF p_access_code IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.team_credentials
    WHERE team_id = v_pick.current_team_id AND access_code = p_access_code
  ) THEN
    RAISE EXCEPTION 'Only the team on the clock (or league admin) can make this pick';
  END IF;

  IF public.player_is_league_keeper(v_pick.league_id, p_player_id) THEN
    RAISE EXCEPTION 'Player is already a keeper in this league';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE league_id = v_pick.league_id
      AND year = v_pick.year
      AND player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'Player has already been drafted';
  END IF;

  UPDATE public.draft_picks
  SET player_id = p_player_id,
      picked_at = now()
  WHERE id = p_pick_id
  RETURNING * INTO v_pick;

  RETURN v_pick;
END;
$$;

GRANT EXECUTE ON FUNCTION public.player_is_league_keeper(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.make_pick_with_code(UUID, TEXT, TEXT) TO anon, authenticated;
