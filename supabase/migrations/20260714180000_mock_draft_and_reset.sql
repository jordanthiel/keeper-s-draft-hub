-- Admin-only mock draft board (invisible to teams) + draft board reset RPC

-- 1. Mock draft picks (same shape as draft_picks; admin-only read/write) --------

CREATE TABLE IF NOT EXISTS public.mock_draft_picks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  original_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  current_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  pick_number INTEGER,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  player_id TEXT REFERENCES public.players(id),
  is_keeper BOOLEAN DEFAULT false,
  picked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (league_id, round, original_team_id, year)
);

CREATE INDEX IF NOT EXISTS idx_mock_draft_picks_league_year
  ON public.mock_draft_picks(league_id, year);

ALTER TABLE public.mock_draft_picks ENABLE ROW LEVEL SECURITY;

-- No public SELECT — teams and guests cannot see mock picks
CREATE POLICY "League admin can select mock draft picks"
  ON public.mock_draft_picks FOR SELECT
  USING (public.can_manage_league(league_id));

CREATE POLICY "League admin can insert mock draft picks"
  ON public.mock_draft_picks FOR INSERT
  WITH CHECK (public.can_manage_league(league_id));

CREATE POLICY "League admin can update mock draft picks"
  ON public.mock_draft_picks FOR UPDATE
  USING (public.can_manage_league(league_id));

CREATE POLICY "League admin can delete mock draft picks"
  ON public.mock_draft_picks FOR DELETE
  USING (public.can_manage_league(league_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.mock_draft_picks;

-- 2. Initialize / clear mock draft --------------------------------------------

CREATE OR REPLACE FUNCTION public.initialize_mock_draft(
  p_league_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM now())::INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rounds INTEGER;
  v_team_count INTEGER;
  v_inserted INTEGER := 0;
  v_round INTEGER;
  v_idx INTEGER;
  v_pick_number INTEGER;
  v_team_ids UUID[];
  v_team_id UUID;
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only the league admin can run a mock draft';
  END IF;

  SELECT num_rounds INTO v_rounds FROM public.leagues WHERE id = p_league_id;
  IF v_rounds IS NULL THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  DELETE FROM public.mock_draft_picks
  WHERE league_id = p_league_id AND year = p_year;

  -- Prefer mirroring live pick ownership (trades); fall back to snake from teams
  IF EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE league_id = p_league_id AND year = p_year
  ) THEN
    INSERT INTO public.mock_draft_picks (
      league_id, original_team_id, current_team_id, round, pick_number, year, is_keeper
    )
    SELECT
      league_id,
      original_team_id,
      current_team_id,
      round,
      pick_number,
      year,
      false
    FROM public.draft_picks
    WHERE league_id = p_league_id AND year = p_year;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  ELSE
    SELECT ARRAY_AGG(id ORDER BY draft_position)
    INTO v_team_ids
    FROM public.teams
    WHERE league_id = p_league_id;

    v_team_count := COALESCE(array_length(v_team_ids, 1), 0);
    IF v_team_count < 2 THEN
      RAISE EXCEPTION 'Add at least 2 teams before starting a mock draft';
    END IF;

    FOR v_round IN 1..v_rounds LOOP
      FOR v_idx IN 1..v_team_count LOOP
        IF v_round % 2 = 1 THEN
          v_team_id := v_team_ids[v_idx];
        ELSE
          v_team_id := v_team_ids[v_team_count - v_idx + 1];
        END IF;
        v_pick_number := (v_round - 1) * v_team_count + v_idx;

        INSERT INTO public.mock_draft_picks (
          league_id, original_team_id, current_team_id, round, pick_number, year, is_keeper
        ) VALUES (
          p_league_id, v_team_id, v_team_id, v_round, v_pick_number, p_year, false
        );
        v_inserted := v_inserted + 1;
      END LOOP;
    END LOOP;
  END IF;

  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'Add at least 2 teams before starting a mock draft';
  END IF;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_mock_draft(
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
    RAISE EXCEPTION 'Only the league admin can clear a mock draft';
  END IF;

  DELETE FROM public.mock_draft_picks
  WHERE league_id = p_league_id AND year = p_year;
END;
$$;

-- 3. Reset live draft board (clears selections; keeps pick ownership/trades) --

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

  UPDATE public.draft_picks
  SET
    player_id = NULL,
    picked_at = NULL,
    is_keeper = false
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

GRANT EXECUTE ON FUNCTION public.initialize_mock_draft(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_mock_draft(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_draft_board(UUID, INTEGER) TO authenticated;
