-- Duplicate an entire league: settings, teams, credentials (new codes),
-- rosters, keepers, pick swaps, draft picks, pick trades, and co-admins.

CREATE OR REPLACE FUNCTION public.duplicate_league(
  p_source_league_id UUID,
  p_new_name TEXT DEFAULT NULL
)
RETURNS public.leagues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.leagues%ROWTYPE;
  v_new public.leagues%ROWTYPE;
  v_old_team RECORD;
  v_new_team_id UUID;
  v_old_pick RECORD;
  v_new_pick_id UUID;
  v_team_map JSONB := '{}'::JSONB;
  v_pick_map JSONB := '{}'::JSONB;
  v_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to duplicate a league';
  END IF;

  IF NOT public.can_manage_league(p_source_league_id) THEN
    RAISE EXCEPTION 'Only league admins can duplicate this league';
  END IF;

  SELECT * INTO v_source FROM public.leagues WHERE id = p_source_league_id;
  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  v_name := NULLIF(trim(COALESCE(p_new_name, '')), '');
  IF v_name IS NULL THEN
    v_name := v_source.name || ' (copy)';
  END IF;

  INSERT INTO public.leagues (
    name,
    num_teams,
    num_rounds,
    num_keepers,
    draft_time_seconds,
    qb_slots,
    rb_slots,
    wr_slots,
    te_slots,
    flex_slots,
    k_slots,
    def_slots,
    bench_slots,
    current_pick,
    current_round,
    draft_status,
    admin_user_id
  )
  VALUES (
    v_name,
    v_source.num_teams,
    v_source.num_rounds,
    v_source.num_keepers,
    v_source.draft_time_seconds,
    v_source.qb_slots,
    v_source.rb_slots,
    v_source.wr_slots,
    v_source.te_slots,
    v_source.flex_slots,
    v_source.k_slots,
    v_source.def_slots,
    v_source.bench_slots,
    v_source.current_pick,
    v_source.current_round,
    v_source.draft_status,
    auth.uid()
  )
  RETURNING * INTO v_new;

  -- Teams + credentials (new access codes)
  FOR v_old_team IN
    SELECT * FROM public.teams
    WHERE league_id = p_source_league_id
    ORDER BY draft_position ASC, created_at ASC
  LOOP
    INSERT INTO public.teams (league_id, name, draft_position, email)
    VALUES (v_new.id, v_old_team.name, v_old_team.draft_position, v_old_team.email)
    RETURNING id INTO v_new_team_id;

    v_team_map := v_team_map || jsonb_build_object(v_old_team.id::TEXT, v_new_team_id::TEXT);

    INSERT INTO public.team_credentials (team_id, access_code)
    VALUES (v_new_team_id, public.generate_team_access_code());
  END LOOP;

  -- Prior-year rosters (before keepers — roster trigger depends on them)
  INSERT INTO public.team_rosters (team_id, player_id, season_year)
  SELECT
    (v_team_map ->> r.team_id::TEXT)::UUID,
    r.player_id,
    r.season_year
  FROM public.team_rosters r
  WHERE r.team_id IN (
    SELECT id FROM public.teams WHERE league_id = p_source_league_id
  );

  -- Keepers
  INSERT INTO public.keepers (team_id, player_id, round_cost)
  SELECT
    (v_team_map ->> k.team_id::TEXT)::UUID,
    k.player_id,
    k.round_cost
  FROM public.keepers k
  WHERE k.team_id IN (
    SELECT id FROM public.teams WHERE league_id = p_source_league_id
  );

  -- Even pick swaps (durable trade records)
  INSERT INTO public.pick_swaps (
    league_id,
    year,
    team_a_id,
    team_b_id,
    slot_a_original_team_id,
    slot_a_round,
    slot_b_original_team_id,
    slot_b_round,
    created_by
  )
  SELECT
    v_new.id,
    s.year,
    (v_team_map ->> s.team_a_id::TEXT)::UUID,
    (v_team_map ->> s.team_b_id::TEXT)::UUID,
    (v_team_map ->> s.slot_a_original_team_id::TEXT)::UUID,
    s.slot_a_round,
    (v_team_map ->> s.slot_b_original_team_id::TEXT)::UUID,
    s.slot_b_round,
    auth.uid()
  FROM public.pick_swaps s
  WHERE s.league_id = p_source_league_id
  ORDER BY s.created_at ASC, s.id ASC;

  -- Draft picks (full state, including drafted players)
  FOR v_old_pick IN
    SELECT *
    FROM public.draft_picks
    WHERE league_id = p_source_league_id
    ORDER BY year ASC, round ASC, pick_number ASC NULLS LAST, created_at ASC
  LOOP
    INSERT INTO public.draft_picks (
      league_id,
      original_team_id,
      current_team_id,
      round,
      pick_number,
      year,
      player_id,
      is_keeper,
      picked_at
    )
    VALUES (
      v_new.id,
      (v_team_map ->> v_old_pick.original_team_id::TEXT)::UUID,
      (v_team_map ->> v_old_pick.current_team_id::TEXT)::UUID,
      v_old_pick.round,
      v_old_pick.pick_number,
      v_old_pick.year,
      v_old_pick.player_id,
      COALESCE(v_old_pick.is_keeper, false),
      v_old_pick.picked_at
    )
    RETURNING id INTO v_new_pick_id;

    v_pick_map := v_pick_map || jsonb_build_object(v_old_pick.id::TEXT, v_new_pick_id::TEXT);
  END LOOP;

  -- Pick trade audit log
  INSERT INTO public.pick_trades (
    league_id,
    from_team_id,
    to_team_id,
    draft_pick_id,
    traded_at
  )
  SELECT
    v_new.id,
    (v_team_map ->> t.from_team_id::TEXT)::UUID,
    (v_team_map ->> t.to_team_id::TEXT)::UUID,
    (v_pick_map ->> t.draft_pick_id::TEXT)::UUID,
    t.traded_at
  FROM public.pick_trades t
  WHERE t.league_id = p_source_league_id
    AND v_pick_map ? t.draft_pick_id::TEXT
  ORDER BY t.traded_at ASC, t.id ASC;

  -- Co-admins (caller is already primary via admin_user_id trigger)
  INSERT INTO public.league_admins (league_id, user_id, created_by)
  SELECT
    v_new.id,
    a.user_id,
    auth.uid()
  FROM public.league_admins a
  WHERE a.league_id = p_source_league_id
    AND a.user_id IS DISTINCT FROM auth.uid()
  ON CONFLICT DO NOTHING;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.duplicate_league(UUID, TEXT) TO authenticated;
