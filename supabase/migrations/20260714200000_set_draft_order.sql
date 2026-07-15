-- Atomically set snake-draft order (draft_position) for a league's teams

CREATE OR REPLACE FUNCTION public.set_draft_order(
  p_league_id UUID,
  p_team_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected INTEGER;
  v_i INTEGER;
  v_team_id UUID;
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only league admins can change the draft order';
  END IF;

  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Team order is required';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_expected
  FROM public.teams
  WHERE league_id = p_league_id;

  IF array_length(p_team_ids, 1) <> v_expected THEN
    RAISE EXCEPTION 'Draft order must include every team in the league exactly once';
  END IF;

  -- Ensure every id belongs to this league and there are no duplicates
  IF (
    SELECT COUNT(DISTINCT t.id)::INTEGER
    FROM unnest(p_team_ids) AS tid(id)
    JOIN public.teams t ON t.id = tid.id AND t.league_id = p_league_id
  ) <> v_expected THEN
    RAISE EXCEPTION 'Draft order contains invalid or duplicate teams';
  END IF;

  -- Shift positions to avoid UNIQUE(league_id, draft_position) conflicts mid-update
  UPDATE public.teams
  SET draft_position = draft_position + 10000
  WHERE league_id = p_league_id;

  FOR v_i IN 1..array_length(p_team_ids, 1) LOOP
    v_team_id := p_team_ids[v_i];
    UPDATE public.teams
    SET draft_position = v_i
    WHERE id = v_team_id
      AND league_id = p_league_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_draft_order(UUID, UUID[]) TO anon, authenticated;
