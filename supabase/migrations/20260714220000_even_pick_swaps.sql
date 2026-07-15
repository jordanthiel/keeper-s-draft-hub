-- Even pick swaps (1-for-1) that work before the draft board is initialized

CREATE TABLE IF NOT EXISTS public.pick_swaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  team_a_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  slot_a_original_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  slot_a_round INTEGER NOT NULL CHECK (slot_a_round > 0),
  team_b_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  slot_b_original_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  slot_b_round INTEGER NOT NULL CHECK (slot_b_round > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (team_a_id <> team_b_id),
  CHECK (NOT (
    slot_a_original_team_id = slot_b_original_team_id
    AND slot_a_round = slot_b_round
  ))
);

CREATE INDEX IF NOT EXISTS idx_pick_swaps_league_year
  ON public.pick_swaps(league_id, year);

ALTER TABLE public.pick_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pick swaps"
  ON public.pick_swaps FOR SELECT
  USING (true);

CREATE POLICY "No direct insert on pick swaps"
  ON public.pick_swaps FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct update on pick swaps"
  ON public.pick_swaps FOR UPDATE
  USING (false);

CREATE POLICY "No direct delete on pick swaps"
  ON public.pick_swaps FOR DELETE
  USING (false);

-- Owner of a (original_team, round) slot when the board is not initialized yet
CREATE OR REPLACE FUNCTION public.pick_slot_owner(
  p_league_id UUID,
  p_year INTEGER,
  p_original_team_id UUID,
  p_round INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_swap RECORD;
BEGIN
  SELECT current_team_id INTO v_owner
  FROM public.draft_picks
  WHERE league_id = p_league_id
    AND year = p_year
    AND original_team_id = p_original_team_id
    AND round = p_round;

  IF FOUND THEN
    RETURN v_owner;
  END IF;

  v_owner := p_original_team_id;

  FOR v_swap IN
    SELECT
      slot_a_original_team_id,
      slot_a_round,
      team_a_id,
      slot_b_original_team_id,
      slot_b_round,
      team_b_id
    FROM public.pick_swaps
    WHERE league_id = p_league_id
      AND year = p_year
    ORDER BY created_at ASC, id ASC
  LOOP
    IF v_swap.slot_a_original_team_id = p_original_team_id
       AND v_swap.slot_a_round = p_round THEN
      v_owner := v_swap.team_b_id;
    ELSIF v_swap.slot_b_original_team_id = p_original_team_id
          AND v_swap.slot_b_round = p_round THEN
      v_owner := v_swap.team_a_id;
    END IF;
  END LOOP;

  RETURN v_owner;
END;
$$;

-- Replay all stored swaps onto live draft_picks for a year
CREATE OR REPLACE FUNCTION public.apply_pick_swaps(
  p_league_id UUID,
  p_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap public.pick_swaps%ROWTYPE;
  v_applied INTEGER := 0;
  v_pick_a UUID;
  v_pick_b UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE league_id = p_league_id AND year = p_year
  ) THEN
    RETURN 0;
  END IF;

  UPDATE public.draft_picks
  SET current_team_id = original_team_id
  WHERE league_id = p_league_id
    AND year = p_year
    AND player_id IS NULL;

  DELETE FROM public.pick_trades
  WHERE draft_pick_id IN (
    SELECT id FROM public.draft_picks
    WHERE league_id = p_league_id AND year = p_year
  );

  FOR v_swap IN
    SELECT *
    FROM public.pick_swaps
    WHERE league_id = p_league_id
      AND year = p_year
    ORDER BY created_at ASC, id ASC
  LOOP
    SELECT id INTO v_pick_a
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = v_swap.slot_a_original_team_id
      AND round = v_swap.slot_a_round
      AND player_id IS NULL;

    SELECT id INTO v_pick_b
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = v_swap.slot_b_original_team_id
      AND round = v_swap.slot_b_round
      AND player_id IS NULL;

    IF v_pick_a IS NULL OR v_pick_b IS NULL THEN
      RAISE EXCEPTION 'Swap references a missing or used pick (year %, rounds %/%)',
        p_year, v_swap.slot_a_round, v_swap.slot_b_round;
    END IF;

    UPDATE public.draft_picks
    SET current_team_id = v_swap.team_b_id
    WHERE id = v_pick_a;

    UPDATE public.draft_picks
    SET current_team_id = v_swap.team_a_id
    WHERE id = v_pick_b;

    INSERT INTO public.pick_trades (league_id, from_team_id, to_team_id, draft_pick_id)
    VALUES
      (p_league_id, v_swap.team_a_id, v_swap.team_b_id, v_pick_a),
      (p_league_id, v_swap.team_b_id, v_swap.team_a_id, v_pick_b);

    v_applied := v_applied + 1;
  END LOOP;

  RETURN v_applied;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_pick_swaps_to_mock(
  p_league_id UUID,
  p_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap public.pick_swaps%ROWTYPE;
  v_applied INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.mock_draft_picks
    WHERE league_id = p_league_id AND year = p_year
  ) THEN
    RETURN 0;
  END IF;

  UPDATE public.mock_draft_picks
  SET current_team_id = original_team_id
  WHERE league_id = p_league_id
    AND year = p_year
    AND player_id IS NULL;

  FOR v_swap IN
    SELECT *
    FROM public.pick_swaps
    WHERE league_id = p_league_id
      AND year = p_year
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE public.mock_draft_picks
    SET current_team_id = v_swap.team_b_id
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = v_swap.slot_a_original_team_id
      AND round = v_swap.slot_a_round
      AND player_id IS NULL;

    UPDATE public.mock_draft_picks
    SET current_team_id = v_swap.team_a_id
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = v_swap.slot_b_original_team_id
      AND round = v_swap.slot_b_round
      AND player_id IS NULL;

    v_applied := v_applied + 1;
  END LOOP;

  RETURN v_applied;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_pick_swap(
  p_league_id UUID,
  p_year INTEGER,
  p_team_a_id UUID,
  p_slot_a_original_team_id UUID,
  p_slot_a_round INTEGER,
  p_team_b_id UUID,
  p_slot_b_original_team_id UUID,
  p_slot_b_round INTEGER
)
RETURNS public.pick_swaps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_a UUID;
  v_owner_b UUID;
  v_rounds INTEGER;
  v_swap public.pick_swaps%ROWTYPE;
  v_has_picks BOOLEAN;
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only league admins can execute pick swaps';
  END IF;

  IF p_team_a_id = p_team_b_id THEN
    RAISE EXCEPTION 'Teams in a swap must be different';
  END IF;

  IF p_slot_a_original_team_id = p_slot_b_original_team_id
     AND p_slot_a_round = p_slot_b_round THEN
    RAISE EXCEPTION 'Cannot swap a pick for itself';
  END IF;

  SELECT num_rounds INTO v_rounds FROM public.leagues WHERE id = p_league_id;
  IF v_rounds IS NULL THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  IF p_slot_a_round < 1 OR p_slot_a_round > v_rounds
     OR p_slot_b_round < 1 OR p_slot_b_round > v_rounds THEN
    RAISE EXCEPTION 'Round must be between 1 and %', v_rounds;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_a_id AND league_id = p_league_id)
     OR NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_b_id AND league_id = p_league_id)
     OR NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_slot_a_original_team_id AND league_id = p_league_id)
     OR NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_slot_b_original_team_id AND league_id = p_league_id) THEN
    RAISE EXCEPTION 'All teams in the swap must belong to this league';
  END IF;

  v_has_picks := EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE league_id = p_league_id AND year = p_year
  );

  IF v_has_picks THEN
    SELECT current_team_id INTO v_owner_a
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = p_slot_a_original_team_id
      AND round = p_slot_a_round
      AND player_id IS NULL;

    SELECT current_team_id INTO v_owner_b
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = p_slot_b_original_team_id
      AND round = p_slot_b_round
      AND player_id IS NULL;

    IF v_owner_a IS NULL OR v_owner_b IS NULL THEN
      RAISE EXCEPTION 'One or both picks are missing or already used';
    END IF;
  ELSE
    v_owner_a := public.pick_slot_owner(
      p_league_id, p_year, p_slot_a_original_team_id, p_slot_a_round
    );
    v_owner_b := public.pick_slot_owner(
      p_league_id, p_year, p_slot_b_original_team_id, p_slot_b_round
    );
  END IF;

  IF v_owner_a <> p_team_a_id THEN
    RAISE EXCEPTION 'Team A does not currently own that pick';
  END IF;
  IF v_owner_b <> p_team_b_id THEN
    RAISE EXCEPTION 'Team B does not currently own that pick';
  END IF;

  INSERT INTO public.pick_swaps (
    league_id,
    year,
    team_a_id,
    slot_a_original_team_id,
    slot_a_round,
    team_b_id,
    slot_b_original_team_id,
    slot_b_round,
    created_by
  ) VALUES (
    p_league_id,
    p_year,
    p_team_a_id,
    p_slot_a_original_team_id,
    p_slot_a_round,
    p_team_b_id,
    p_slot_b_original_team_id,
    p_slot_b_round,
    auth.uid()
  )
  RETURNING * INTO v_swap;

  IF v_has_picks THEN
    PERFORM public.apply_pick_swaps(p_league_id, p_year);
  END IF;

  RETURN v_swap;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_pick_swap(p_swap_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id UUID;
  v_year INTEGER;
BEGIN
  SELECT league_id, year INTO v_league_id, v_year
  FROM public.pick_swaps
  WHERE id = p_swap_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Swap not found';
  END IF;

  IF NOT public.can_manage_league(v_league_id) THEN
    RAISE EXCEPTION 'Only league admins can delete pick swaps';
  END IF;

  DELETE FROM public.pick_swaps WHERE id = p_swap_id;

  IF EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE league_id = v_league_id AND year = v_year
  ) THEN
    PERFORM public.apply_pick_swaps(v_league_id, v_year);
  END IF;
END;
$$;

-- Mock drafts built from teams (no live board) should still honor swaps
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
  v_from_live BOOLEAN := false;
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

  IF EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE league_id = p_league_id AND year = p_year
  ) THEN
    v_from_live := true;
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

  IF NOT v_from_live THEN
    PERFORM public.apply_pick_swaps_to_mock(p_league_id, p_year);
  END IF;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pick_slot_owner(UUID, INTEGER, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pick_swaps(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pick_swaps_to_mock(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_pick_swap(UUID, INTEGER, UUID, UUID, INTEGER, UUID, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pick_swap(UUID) TO anon, authenticated;
