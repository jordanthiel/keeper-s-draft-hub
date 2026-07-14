-- League admin ownership + team email/access codes

-- 1. Schema -----------------------------------------------------------------

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Credentials kept separate so access codes are not publicly readable
CREATE TABLE IF NOT EXISTS public.team_credentials (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  access_code TEXT NOT NULL CHECK (access_code ~ '^\d{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_credentials ENABLE ROW LEVEL SECURITY;
-- No direct policies: access only via SECURITY DEFINER functions

-- 2. Helpers ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_team_access_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
BEGIN
  LOOP
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.team_credentials WHERE access_code = code
    );
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_league_admin(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leagues
    WHERE id = p_league_id
      AND admin_user_id IS NOT NULL
      AND admin_user_id = auth.uid()
  );
$$;

-- Legacy leagues (no admin) keep open write access for local seed / old data
CREATE OR REPLACE FUNCTION public.league_allows_open_write(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leagues
    WHERE id = p_league_id
      AND admin_user_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_league(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_league_admin(p_league_id)
      OR public.league_allows_open_write(p_league_id);
$$;

-- 3. RPCs -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_team_access(
  p_league_id UUID,
  p_access_code TEXT
)
RETURNS TABLE (
  id UUID,
  league_id UUID,
  name TEXT,
  draft_position INTEGER,
  email TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_access_code IS NULL OR p_access_code !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'Invalid access code';
  END IF;

  RETURN QUERY
  SELECT t.id, t.league_id, t.name, t.draft_position, t.email, t.created_at
  FROM public.teams t
  JOIN public.team_credentials c ON c.team_id = t.id
  WHERE t.league_id = p_league_id
    AND c.access_code = p_access_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_team_with_access(
  p_league_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_draft_position INTEGER
)
RETURNS TABLE (
  id UUID,
  league_id UUID,
  name TEXT,
  draft_position INTEGER,
  email TEXT,
  created_at TIMESTAMPTZ,
  access_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_code TEXT;
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only the league admin can add teams';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' OR p_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Team name is required';
  END IF;

  v_code := public.generate_team_access_code();

  INSERT INTO public.teams (league_id, name, draft_position, email)
  VALUES (p_league_id, trim(p_name), p_draft_position, lower(trim(p_email)))
  RETURNING * INTO v_team;

  INSERT INTO public.team_credentials (team_id, access_code)
  VALUES (v_team.id, v_code);

  RETURN QUERY
  SELECT v_team.id, v_team.league_id, v_team.name, v_team.draft_position,
         v_team.email, v_team.created_at, v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_team_access_codes(p_league_id UUID)
RETURNS TABLE (
  team_id UUID,
  team_name TEXT,
  email TEXT,
  access_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_league_admin(p_league_id) AND NOT public.league_allows_open_write(p_league_id) THEN
    RAISE EXCEPTION 'Only the league admin can view access codes';
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.email, c.access_code
  FROM public.teams t
  JOIN public.team_credentials c ON c.team_id = t.id
  WHERE t.league_id = p_league_id
  ORDER BY t.draft_position;
END;
$$;

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
BEGIN
  SELECT league_id INTO v_league_id FROM public.teams WHERE id = p_team_id;
  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  IF public.can_manage_league(v_league_id) THEN
    NULL; -- admin / legacy open
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.team_credentials
    WHERE team_id = p_team_id AND access_code = p_access_code
  ) THEN
    RAISE EXCEPTION 'Invalid access code for this team';
  END IF;

  INSERT INTO public.keepers (team_id, player_id, round_cost)
  VALUES (p_team_id, p_player_id, COALESCE(p_round_cost, 0))
  RETURNING * INTO v_keeper;

  RETURN v_keeper;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_keeper_with_code(
  p_keeper_id UUID,
  p_access_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_league_id UUID;
BEGIN
  SELECT k.team_id, t.league_id
  INTO v_team_id, v_league_id
  FROM public.keepers k
  JOIN public.teams t ON t.id = k.team_id
  WHERE k.id = p_keeper_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Keeper not found';
  END IF;

  IF public.can_manage_league(v_league_id) THEN
    NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.team_credentials
    WHERE team_id = v_team_id AND access_code = p_access_code
  ) THEN
    RAISE EXCEPTION 'Invalid access code for this team';
  END IF;

  DELETE FROM public.keepers WHERE id = p_keeper_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.make_pick_with_code(
  p_pick_id UUID,
  p_player_id TEXT,
  p_access_code TEXT DEFAULT NULL
)
RETURNS public.draft_picks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick public.draft_picks%ROWTYPE;
BEGIN
  SELECT * INTO v_pick FROM public.draft_picks WHERE id = p_pick_id;
  IF v_pick.id IS NULL THEN
    RAISE EXCEPTION 'Pick not found';
  END IF;

  IF v_pick.player_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pick already made';
  END IF;

  IF public.can_manage_league(v_pick.league_id) THEN
    NULL;
  ELSIF p_access_code IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.team_credentials
    WHERE team_id = v_pick.current_team_id AND access_code = p_access_code
  ) THEN
    RAISE EXCEPTION 'Only the team on the clock (or league admin) can make this pick';
  END IF;

  UPDATE public.draft_picks
  SET player_id = p_player_id,
      picked_at = now()
  WHERE id = p_pick_id
  RETURNING * INTO v_pick;

  RETURN v_pick;
END;
$$;

CREATE OR REPLACE FUNCTION public.trade_pick_with_code(
  p_pick_id UUID,
  p_from_team_id UUID,
  p_to_team_id UUID,
  p_access_code TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick public.draft_picks%ROWTYPE;
BEGIN
  SELECT * INTO v_pick FROM public.draft_picks WHERE id = p_pick_id;
  IF v_pick.id IS NULL THEN
    RAISE EXCEPTION 'Pick not found';
  END IF;

  IF v_pick.current_team_id <> p_from_team_id THEN
    RAISE EXCEPTION 'Pick is not owned by the from team';
  END IF;

  IF v_pick.player_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot trade a used pick';
  END IF;

  -- Admins can trade any pick; team managers can only trade picks they own
  IF public.can_manage_league(v_pick.league_id) THEN
    NULL;
  ELSIF p_access_code IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.team_credentials
    WHERE team_id = p_from_team_id AND access_code = p_access_code
  ) THEN
    RAISE EXCEPTION 'Only the pick owner or league admin can trade this pick';
  END IF;

  UPDATE public.draft_picks
  SET current_team_id = p_to_team_id
  WHERE id = p_pick_id;

  INSERT INTO public.pick_trades (league_id, from_team_id, to_team_id, draft_pick_id)
  VALUES (v_pick.league_id, p_from_team_id, p_to_team_id, p_pick_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_team_access(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_with_access(UUID, TEXT, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_team_access_codes(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_keeper_with_code(UUID, TEXT, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_keeper_with_code(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.make_pick_with_code(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trade_pick_with_code(UUID, UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_league_admin(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_league(UUID) TO anon, authenticated;

-- 4. Replace open write policies with role-aware ones ---------------------

DROP POLICY IF EXISTS "Allow public insert on leagues" ON public.leagues;
DROP POLICY IF EXISTS "Allow public update on leagues" ON public.leagues;
DROP POLICY IF EXISTS "Allow public delete on leagues" ON public.leagues;

CREATE POLICY "Authenticated users can create leagues"
  ON public.leagues FOR INSERT TO authenticated
  WITH CHECK (admin_user_id = auth.uid());

CREATE POLICY "League admin can update league"
  ON public.leagues FOR UPDATE
  USING (admin_user_id IS NULL OR admin_user_id = auth.uid())
  WITH CHECK (admin_user_id IS NULL OR admin_user_id = auth.uid());

CREATE POLICY "League admin can delete league"
  ON public.leagues FOR DELETE
  USING (admin_user_id IS NULL OR admin_user_id = auth.uid());

DROP POLICY IF EXISTS "Allow public insert on teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public update on teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public delete on teams" ON public.teams;

CREATE POLICY "League admin can insert teams"
  ON public.teams FOR INSERT
  WITH CHECK (public.can_manage_league(league_id));

CREATE POLICY "League admin can update teams"
  ON public.teams FOR UPDATE
  USING (public.can_manage_league(league_id));

CREATE POLICY "League admin can delete teams"
  ON public.teams FOR DELETE
  USING (public.can_manage_league(league_id));

-- Keepers / picks: prefer RPCs for team managers; direct writes for admins / legacy
DROP POLICY IF EXISTS "Allow public insert on keepers" ON public.keepers;
DROP POLICY IF EXISTS "Allow public update on keepers" ON public.keepers;
DROP POLICY IF EXISTS "Allow public delete on keepers" ON public.keepers;

CREATE POLICY "League admin can insert keepers"
  ON public.keepers FOR INSERT
  WITH CHECK (
    public.can_manage_league((SELECT league_id FROM public.teams WHERE id = team_id))
  );

CREATE POLICY "League admin can update keepers"
  ON public.keepers FOR UPDATE
  USING (
    public.can_manage_league((SELECT league_id FROM public.teams WHERE id = team_id))
  );

CREATE POLICY "League admin can delete keepers"
  ON public.keepers FOR DELETE
  USING (
    public.can_manage_league((SELECT league_id FROM public.teams WHERE id = team_id))
  );

DROP POLICY IF EXISTS "Allow public insert on draft_picks" ON public.draft_picks;
DROP POLICY IF EXISTS "Allow public update on draft_picks" ON public.draft_picks;
DROP POLICY IF EXISTS "Allow public delete on draft_picks" ON public.draft_picks;

CREATE POLICY "League admin can insert draft picks"
  ON public.draft_picks FOR INSERT
  WITH CHECK (public.can_manage_league(league_id));

CREATE POLICY "League admin can update draft picks"
  ON public.draft_picks FOR UPDATE
  USING (public.can_manage_league(league_id));

CREATE POLICY "League admin can delete draft picks"
  ON public.draft_picks FOR DELETE
  USING (public.can_manage_league(league_id));

DROP POLICY IF EXISTS "Allow public insert on pick_trades" ON public.pick_trades;

CREATE POLICY "League admin can insert pick trades"
  ON public.pick_trades FOR INSERT
  WITH CHECK (public.can_manage_league(league_id));
