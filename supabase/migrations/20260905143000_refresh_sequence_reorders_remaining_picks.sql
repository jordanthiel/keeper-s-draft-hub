-- Ensure "Restart Sequence" also reorders remaining pick_number values
-- so the highlighted on-clock slot matches the selected draft type.
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
  v_effective_draft_type TEXT;
  v_start_pick_number INTEGER;
  v_next_pick RECORD;
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

  SELECT MIN(pick_number)
  INTO v_start_pick_number
  FROM public.draft_picks
  WHERE league_id = p_league_id
    AND year = p_year
    AND player_id IS NULL
    AND COALESCE(is_keeper, false) = false;

  IF v_start_pick_number IS NULL THEN
    RETURN;
  END IF;

  -- Re-sequence remaining picks in desired round order, and align current_team_id.
  WITH ranked AS (
    SELECT
      p.id,
      p.round,
      t.draft_position,
      ROW_NUMBER() OVER (
        ORDER BY
          p.round ASC,
          CASE
            WHEN v_effective_draft_type = 'snake' AND (p.round % 2 = 0)
              THEN (v_team_count - t.draft_position + 1)
            ELSE t.draft_position
          END ASC,
          p.created_at ASC,
          p.id ASC
      ) AS seq
    FROM public.draft_picks p
    JOIN public.teams t ON t.id = p.original_team_id
    WHERE p.league_id = p_league_id
      AND p.year = p_year
      AND p.player_id IS NULL
      AND COALESCE(p.is_keeper, false) = false
  )
  UPDATE public.draft_picks p
  SET
    pick_number = v_start_pick_number + ranked.seq - 1,
    current_team_id = p.original_team_id
  FROM ranked
  WHERE p.id = ranked.id;

  -- Re-apply configured pick swaps to the newly sequenced open slots.
  PERFORM public.apply_pick_swaps(p_league_id, p_year);

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
