-- Prior-year team rosters: admin sets the returning roster; keepers must come from it.

CREATE TABLE IF NOT EXISTS public.team_rosters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, player_id, season_year)
);

CREATE INDEX IF NOT EXISTS team_rosters_team_season_idx
  ON public.team_rosters (team_id, season_year);

ALTER TABLE public.team_rosters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read team rosters"
  ON public.team_rosters FOR SELECT
  USING (true);

CREATE POLICY "League admin can insert team rosters"
  ON public.team_rosters FOR INSERT
  WITH CHECK (
    public.can_manage_league((SELECT league_id FROM public.teams WHERE id = team_id))
  );

CREATE POLICY "League admin can delete team rosters"
  ON public.team_rosters FOR DELETE
  USING (
    public.can_manage_league((SELECT league_id FROM public.teams WHERE id = team_id))
  );

-- Keepers must belong to the prior-year roster when one exists for the team.
CREATE OR REPLACE FUNCTION public.enforce_keeper_from_roster()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season INTEGER := EXTRACT(YEAR FROM now())::INTEGER - 1;
  v_has_roster BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.team_rosters
    WHERE team_id = NEW.team_id
      AND season_year = v_season
  ) INTO v_has_roster;

  IF v_has_roster AND NOT EXISTS (
    SELECT 1 FROM public.team_rosters
    WHERE team_id = NEW.team_id
      AND player_id = NEW.player_id
      AND season_year = v_season
  ) THEN
    RAISE EXCEPTION 'Keepers must be selected from last year''s roster';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keepers_must_be_on_roster ON public.keepers;
CREATE TRIGGER keepers_must_be_on_roster
  BEFORE INSERT ON public.keepers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_keeper_from_roster();

-- Update RPC with the same check (clearer error for clients)
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
  v_keeper public.keepers%ROWTYPE;
  v_season INTEGER := EXTRACT(YEAR FROM now())::INTEGER - 1;
BEGIN
  SELECT league_id INTO v_league_id FROM public.teams WHERE id = p_team_id;
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

  INSERT INTO public.keepers (team_id, player_id, round_cost)
  VALUES (p_team_id, p_player_id, COALESCE(p_round_cost, 0))
  RETURNING * INTO v_keeper;

  RETURN v_keeper;
END;
$$;
