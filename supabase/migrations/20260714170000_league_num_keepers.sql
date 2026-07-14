-- How many keepers each team may select.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS num_keepers INTEGER NOT NULL DEFAULT 3
  CHECK (num_keepers >= 0 AND num_keepers <= 30);

-- Enforce max keepers on insert (covers admin direct inserts and RPC).
CREATE OR REPLACE FUNCTION public.enforce_keeper_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id UUID;
  v_max INTEGER;
  v_count INTEGER;
BEGIN
  SELECT t.league_id, l.num_keepers
  INTO v_league_id, v_max
  FROM public.teams t
  JOIN public.leagues l ON l.id = t.league_id
  WHERE t.id = NEW.team_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.keepers
  WHERE team_id = NEW.team_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'This team already has the maximum of % keeper(s)', v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keepers_respect_league_limit ON public.keepers;
CREATE TRIGGER keepers_respect_league_limit
  BEFORE INSERT ON public.keepers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_keeper_limit();

-- Clearer error from the team-code RPC as well.
CREATE OR REPLACE FUNCTION public.add_keeper_with_code(
  p_team_id UUID,
  p_player_id TEXT,
  p_access_code TEXT,
  p_round_cost INTEGER DEFAULT 0
)
RETURNS public.keepers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id UUID;
  v_max INTEGER;
  v_count INTEGER;
  v_keeper public.keepers%ROWTYPE;
  v_season INTEGER := EXTRACT(YEAR FROM now())::INTEGER - 1;
BEGIN
  SELECT t.league_id, l.num_keepers
  INTO v_league_id, v_max
  FROM public.teams t
  JOIN public.leagues l ON l.id = t.league_id
  WHERE t.id = p_team_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  IF public.can_manage_league(v_league_id) THEN
    NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.team_credentials
    WHERE team_id = p_team_id AND access_code = p_access_code
  ) THEN
    RAISE EXCEPTION 'Invalid access code for this team';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_rosters
    WHERE team_id = p_team_id AND season_year = v_season
  ) AND NOT EXISTS (
    SELECT 1 FROM public.team_rosters
    WHERE team_id = p_team_id
      AND player_id = p_player_id
      AND season_year = v_season
  ) THEN
    RAISE EXCEPTION 'Keepers must be selected from last year''s roster';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.keepers
  WHERE team_id = p_team_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'This team already has the maximum of % keeper(s)', v_max;
  END IF;

  INSERT INTO public.keepers (team_id, player_id, round_cost)
  VALUES (p_team_id, p_player_id, COALESCE(p_round_cost, 0))
  RETURNING * INTO v_keeper;

  RETURN v_keeper;
END;
$$;
