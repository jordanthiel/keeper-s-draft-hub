-- Use saved league draft_type when no override is provided.
CREATE OR REPLACE FUNCTION public.refresh_draft_order_type(
  p_league_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM now())::INTEGER,
  p_draft_type TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_ids UUID[];
  v_team_count INTEGER;
  v_pick RECORD;
  v_slot_index INTEGER;
  v_target_team_id UUID;
  v_next_pick RECORD;
  v_effective_draft_type TEXT;
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only the league admin can refresh draft order';
  END IF;

  SELECT COALESCE(p_draft_type, draft_type, 'snake')
  INTO v_effective_draft_type
  FROM public.leagues
  WHERE id = p_league_id;

  IF v_effective_draft_type IS NULL THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  IF v_effective_draft_type NOT IN ('snake', 'classic') THEN
    RAISE EXCEPTION 'Invalid draft type: %', v_effective_draft_type;
  END IF;

  SELECT ARRAY_AGG(id ORDER BY draft_position)
  INTO v_team_ids
  FROM public.teams
  WHERE league_id = p_league_id;

  v_team_count := COALESCE(array_length(v_team_ids, 1), 0);
  IF v_team_count < 2 THEN
    RAISE EXCEPTION 'Add at least 2 teams before refreshing draft order';
  END IF;

  UPDATE public.leagues
  SET draft_type = v_effective_draft_type,
      updated_at = now()
  WHERE id = p_league_id;

  FOR v_pick IN
    SELECT id, round, pick_number
    FROM public.draft_picks
    WHERE league_id = p_league_id
      AND year = p_year
      AND player_id IS NULL
      AND COALESCE(is_keeper, false) = false
    ORDER BY pick_number ASC NULLS LAST, round ASC, created_at ASC, id ASC
  LOOP
    IF v_pick.pick_number IS NULL THEN
      CONTINUE;
    END IF;

    v_slot_index := ((v_pick.pick_number - 1) % v_team_count) + 1;
    IF v_effective_draft_type = 'snake' AND (v_pick.round % 2 = 0) THEN
      v_target_team_id := v_team_ids[v_team_count - v_slot_index + 1];
    ELSE
      v_target_team_id := v_team_ids[v_slot_index];
    END IF;

    UPDATE public.draft_picks
    SET current_team_id = v_target_team_id
    WHERE id = v_pick.id;
  END LOOP;

  SELECT round, pick_number
  INTO v_next_pick
  FROM public.draft_picks
  WHERE league_id = p_league_id
    AND year = p_year
    AND player_id IS NULL
    AND COALESCE(is_keeper, false) = false
  ORDER BY pick_number ASC NULLS LAST, round ASC, created_at ASC, id ASC
  LIMIT 1;

  IF v_next_pick.pick_number IS NOT NULL THEN
    UPDATE public.leagues
    SET current_round = v_next_pick.round,
        current_pick = v_next_pick.pick_number,
        updated_at = now()
    WHERE id = p_league_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_draft_order_type(UUID, INTEGER, TEXT) TO anon, authenticated;
