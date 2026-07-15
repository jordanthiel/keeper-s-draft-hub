-- Apply new live-board swaps directly (don't replay history that may include used picks).
-- Full replay remains for initialize, when all picks are still empty.

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
  v_pick_a UUID;
  v_pick_b UUID;
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
    SELECT id, current_team_id INTO v_pick_a, v_owner_a
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = p_slot_a_original_team_id
      AND round = p_slot_a_round;

    SELECT id, current_team_id INTO v_pick_b, v_owner_b
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = p_slot_b_original_team_id
      AND round = p_slot_b_round;

    IF v_pick_a IS NULL OR v_pick_b IS NULL THEN
      RAISE EXCEPTION 'One or both picks are missing from the draft board (rounds % and %). Reset and re-initialize if the board is out of date.',
        p_slot_a_round, p_slot_b_round;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.draft_picks
      WHERE id IN (v_pick_a, v_pick_b) AND player_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Cannot trade a pick that has already been used';
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

  -- Live board: apply this swap only (do not replay history — used picks break replay)
  IF v_has_picks THEN
    UPDATE public.draft_picks
    SET current_team_id = p_team_b_id
    WHERE id = v_pick_a;

    UPDATE public.draft_picks
    SET current_team_id = p_team_a_id
    WHERE id = v_pick_b;

    INSERT INTO public.pick_trades (league_id, from_team_id, to_team_id, draft_pick_id)
    VALUES
      (p_league_id, p_team_a_id, p_team_b_id, v_pick_a),
      (p_league_id, p_team_b_id, p_team_a_id, v_pick_b);
  END IF;

  RETURN v_swap;
END;
$$;

-- On initialize, only replay onto empty picks; skip slots that somehow already have players
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
  v_used_a BOOLEAN;
  v_used_b BOOLEAN;
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
    SELECT id, player_id IS NOT NULL
    INTO v_pick_a, v_used_a
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = v_swap.slot_a_original_team_id
      AND round = v_swap.slot_a_round;

    SELECT id, player_id IS NOT NULL
    INTO v_pick_b, v_used_b
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND original_team_id = v_swap.slot_b_original_team_id
      AND round = v_swap.slot_b_round;

    IF v_pick_a IS NULL OR v_pick_b IS NULL THEN
      RAISE EXCEPTION
        'Stored trade references a pick that is not on the board (year %, rounds % and %). Remove that trade or re-initialize the board.',
        p_year, v_swap.slot_a_round, v_swap.slot_b_round;
    END IF;

    -- During a live draft, used picks keep their owner; only move empty picks
    IF NOT COALESCE(v_used_a, false) THEN
      UPDATE public.draft_picks
      SET current_team_id = v_swap.team_b_id
      WHERE id = v_pick_a;

      INSERT INTO public.pick_trades (league_id, from_team_id, to_team_id, draft_pick_id)
      VALUES (p_league_id, v_swap.team_a_id, v_swap.team_b_id, v_pick_a);
    END IF;

    IF NOT COALESCE(v_used_b, false) THEN
      UPDATE public.draft_picks
      SET current_team_id = v_swap.team_a_id
      WHERE id = v_pick_b;

      INSERT INTO public.pick_trades (league_id, from_team_id, to_team_id, draft_pick_id)
      VALUES (p_league_id, v_swap.team_b_id, v_swap.team_a_id, v_pick_b);
    END IF;

    v_applied := v_applied + 1;
  END LOOP;

  RETURN v_applied;
END;
$$;

-- Deleting a swap on a live board: reverse only if both picks are still unused
CREATE OR REPLACE FUNCTION public.delete_pick_swap(p_swap_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap public.pick_swaps%ROWTYPE;
  v_pick_a UUID;
  v_pick_b UUID;
  v_used_a BOOLEAN;
  v_used_b BOOLEAN;
  v_has_picks BOOLEAN;
BEGIN
  SELECT * INTO v_swap
  FROM public.pick_swaps
  WHERE id = p_swap_id;

  IF v_swap.id IS NULL THEN
    RAISE EXCEPTION 'Swap not found';
  END IF;

  IF NOT public.can_manage_league(v_swap.league_id) THEN
    RAISE EXCEPTION 'Only league admins can delete pick swaps';
  END IF;

  v_has_picks := EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE league_id = v_swap.league_id AND year = v_swap.year
  );

  IF v_has_picks THEN
    SELECT id, player_id IS NOT NULL INTO v_pick_a, v_used_a
    FROM public.draft_picks
    WHERE league_id = v_swap.league_id
      AND year = v_swap.year
      AND original_team_id = v_swap.slot_a_original_team_id
      AND round = v_swap.slot_a_round;

    SELECT id, player_id IS NOT NULL INTO v_pick_b, v_used_b
    FROM public.draft_picks
    WHERE league_id = v_swap.league_id
      AND year = v_swap.year
      AND original_team_id = v_swap.slot_b_original_team_id
      AND round = v_swap.slot_b_round;

    IF COALESCE(v_used_a, false) OR COALESCE(v_used_b, false) THEN
      RAISE EXCEPTION 'Cannot remove a trade after one of those picks has been used';
    END IF;
  END IF;

  DELETE FROM public.pick_swaps WHERE id = p_swap_id;

  IF v_has_picks THEN
    -- Rebuild ownership for unused picks from remaining swaps
    PERFORM public.apply_pick_swaps(v_swap.league_id, v_swap.year);
  END IF;
END;
$$;
