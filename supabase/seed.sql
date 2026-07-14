-- Seed data for local draft/keeper testing.
-- 12-team, 8-round league. Each team has 9 keepers on their roster
-- (not tied to draft rounds). Draft picks are initialized for the current year.

DELETE FROM public.leagues WHERE id = '11111111-1111-1111-1111-111111111111';
DELETE FROM public.players WHERE id LIKE 'seed_%';

-- Build a large player pool: 108 keepers (12×9) + extras for the draft.
INSERT INTO public.players (id, first_name, last_name, full_name, position, team, status, years_exp, search_rank)
SELECT
  'seed_' || lpad(gs::text, 3, '0') AS id,
  'Player' AS first_name,
  gs::text AS last_name,
  'Player ' || gs AS full_name,
  (ARRAY['QB', 'RB', 'WR', 'WR', 'RB', 'TE', 'WR', 'RB', 'K', 'DEF'])[((gs - 1) % 10) + 1] AS position,
  (ARRAY['BUF', 'KC', 'PHI', 'SF', 'BAL', 'DET', 'DAL', 'MIA', 'CIN', 'LAR', 'GB', 'HOU'])[((gs - 1) % 12) + 1] AS team,
  'Active' AS status,
  ((gs - 1) % 8) + 1 AS years_exp,
  gs AS search_rank
FROM generate_series(1, 220) AS gs;

INSERT INTO public.players_last_sync (id, synced_at)
VALUES (1, now())
ON CONFLICT (id) DO UPDATE SET synced_at = EXCLUDED.synced_at;

INSERT INTO public.leagues (
  id,
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
  draft_status
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Seed Test League',
  12,
  8,
  9,
  90,
  1,
  2,
  2,
  1,
  2,
  1,
  1,
  6,
  1,
  1,
  'not_started'
);

-- Seed league has admin_user_id NULL (legacy open mode) so local testing
-- works without creating an auth user. New leagues always set an admin.
INSERT INTO public.teams (id, league_id, name, draft_position, email) VALUES
  ('22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111111', 'Gridiron Gladiators', 1, 'team1@example.com'),
  ('22222222-2222-2222-2222-222222222002', '11111111-1111-1111-1111-111111111111', 'Touchdown Titans', 2, 'team2@example.com'),
  ('22222222-2222-2222-2222-222222222003', '11111111-1111-1111-1111-111111111111', 'End Zone Elite', 3, 'team3@example.com'),
  ('22222222-2222-2222-2222-222222222004', '11111111-1111-1111-1111-111111111111', 'Blitz Brigade', 4, 'team4@example.com'),
  ('22222222-2222-2222-2222-222222222005', '11111111-1111-1111-1111-111111111111', 'Hail Mary Heroes', 5, 'team5@example.com'),
  ('22222222-2222-2222-2222-222222222006', '11111111-1111-1111-1111-111111111111', 'Pigskin Pirates', 6, 'team6@example.com'),
  ('22222222-2222-2222-2222-222222222007', '11111111-1111-1111-1111-111111111111', 'First Down Dynasty', 7, 'team7@example.com'),
  ('22222222-2222-2222-2222-222222222008', '11111111-1111-1111-1111-111111111111', 'Red Zone Renegades', 8, 'team8@example.com'),
  ('22222222-2222-2222-2222-222222222009', '11111111-1111-1111-1111-111111111111', 'Audible Assassins', 9, 'team9@example.com'),
  ('22222222-2222-2222-2222-222222222010', '11111111-1111-1111-1111-111111111111', 'Pocket Passers', 10, 'team10@example.com'),
  ('22222222-2222-2222-2222-222222222011', '11111111-1111-1111-1111-111111111111', 'Goal Line Grinders', 11, 'team11@example.com'),
  ('22222222-2222-2222-2222-222222222012', '11111111-1111-1111-1111-111111111111', 'Chip Shot Champions', 12, 'team12@example.com');

-- Deterministic access codes for seed teams: 100001 … 100012
INSERT INTO public.team_credentials (team_id, access_code)
SELECT
  id,
  (100000 + draft_position)::text
FROM public.teams
WHERE league_id = '11111111-1111-1111-1111-111111111111';

-- Prior-year roster: 15 players per team (from which keepers are chosen).
INSERT INTO public.team_rosters (team_id, player_id, season_year)
SELECT
  t.id AS team_id,
  'seed_' || lpad((((t.draft_position - 1) * 15) + n)::text, 3, '0') AS player_id,
  (EXTRACT(YEAR FROM now())::INTEGER - 1) AS season_year
FROM public.teams t
CROSS JOIN generate_series(1, 15) AS n
WHERE t.league_id = '11111111-1111-1111-1111-111111111111';

-- 9 keepers per team chosen from that roster. round_cost unused for board placement.
INSERT INTO public.keepers (team_id, player_id, round_cost)
SELECT
  t.id AS team_id,
  'seed_' || lpad((((t.draft_position - 1) * 15) + k.n)::text, 3, '0') AS player_id,
  0 AS round_cost
FROM public.teams t
CROSS JOIN generate_series(1, 9) AS k(n)
WHERE t.league_id = '11111111-1111-1111-1111-111111111111';

-- Snake-order draft picks for the current calendar year (no keepers on pick slots).
DO $$
DECLARE
  v_league_id UUID := '11111111-1111-1111-1111-111111111111';
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_round INTEGER;
  v_pick_number INTEGER := 0;
  v_team_ids UUID[];
  v_ordered UUID[];
  v_idx INTEGER;
BEGIN
  SELECT ARRAY_AGG(id ORDER BY draft_position)
  INTO v_team_ids
  FROM public.teams
  WHERE league_id = v_league_id;

  FOR v_round IN 1..8 LOOP
    IF v_round % 2 = 1 THEN
      v_ordered := v_team_ids;
    ELSE
      SELECT ARRAY_AGG(id ORDER BY ord DESC)
      INTO v_ordered
      FROM unnest(v_team_ids) WITH ORDINALITY AS t(id, ord);
    END IF;

    FOR v_idx IN 1..array_length(v_ordered, 1) LOOP
      v_pick_number := v_pick_number + 1;
      INSERT INTO public.draft_picks (
        league_id,
        original_team_id,
        current_team_id,
        round,
        pick_number,
        year,
        is_keeper
      ) VALUES (
        v_league_id,
        v_ordered[v_idx],
        v_ordered[v_idx],
        v_round,
        v_pick_number,
        v_year,
        false
      );
    END LOOP;
  END LOOP;
END $$;
