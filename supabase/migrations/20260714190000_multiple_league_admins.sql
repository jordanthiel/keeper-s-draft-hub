-- Multiple league admins via league_admins join table
-- leagues.admin_user_id remains as the primary/creator admin for compatibility

CREATE TABLE IF NOT EXISTS public.league_admins (
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_admins_user_id ON public.league_admins(user_id);

ALTER TABLE public.league_admins ENABLE ROW LEVEL SECURITY;

-- Backfill from existing primary admin column
INSERT INTO public.league_admins (league_id, user_id)
SELECT id, admin_user_id
FROM public.leagues
WHERE admin_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Keep league_admins in sync when leagues.admin_user_id is set
CREATE OR REPLACE FUNCTION public.sync_league_primary_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.admin_user_id IS NOT NULL THEN
    INSERT INTO public.league_admins (league_id, user_id, created_by)
    VALUES (NEW.id, NEW.admin_user_id, NEW.admin_user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_league_primary_admin ON public.leagues;
CREATE TRIGGER trg_sync_league_primary_admin
  AFTER INSERT OR UPDATE OF admin_user_id ON public.leagues
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_league_primary_admin();

-- Redefine admin helpers to use membership table
CREATE OR REPLACE FUNCTION public.is_league_admin(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.league_admins la
        WHERE la.league_id = p_league_id
          AND la.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.leagues l
        WHERE l.id = p_league_id
          AND l.admin_user_id IS NOT NULL
          AND l.admin_user_id = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.league_allows_open_write(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leagues l
    WHERE l.id = p_league_id
      AND l.admin_user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.league_admins la WHERE la.league_id = p_league_id
      )
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

-- league_admins RLS (is_league_admin is SECURITY DEFINER — no recursion)
CREATE POLICY "Members and managers can view league admins"
  ON public.league_admins FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_league_admin(league_id)
    OR public.league_allows_open_write(league_id)
  );

-- Mutations go through SECURITY DEFINER RPCs only
CREATE POLICY "No direct insert on league admins"
  ON public.league_admins FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct update on league admins"
  ON public.league_admins FOR UPDATE
  USING (false);

CREATE POLICY "No direct delete on league admins"
  ON public.league_admins FOR DELETE
  USING (false);

-- League row policies: any admin can update/delete
DROP POLICY IF EXISTS "League admin can update league" ON public.leagues;
DROP POLICY IF EXISTS "League admin can delete league" ON public.leagues;

CREATE POLICY "League admin can update league"
  ON public.leagues FOR UPDATE
  USING (public.can_manage_league(id))
  WITH CHECK (public.can_manage_league(id));

CREATE POLICY "League admin can delete league"
  ON public.leagues FOR DELETE
  USING (public.can_manage_league(id));

-- Admin management RPCs -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_league_admins(p_league_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  is_primary BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only league admins can view the admin list';
  END IF;

  RETURN QUERY
  SELECT
    la.user_id,
    u.email::TEXT,
    (l.admin_user_id IS NOT NULL AND l.admin_user_id = la.user_id) AS is_primary,
    la.created_at
  FROM public.league_admins la
  JOIN auth.users u ON u.id = la.user_id
  JOIN public.leagues l ON l.id = la.league_id
  WHERE la.league_id = p_league_id
  ORDER BY is_primary DESC, la.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_league_admin_by_email(
  p_league_id UUID,
  p_email TEXT
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  is_primary BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT := lower(trim(p_email));
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only league admins can add admins';
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account found with that email. They must create an account first.';
  END IF;

  INSERT INTO public.league_admins (league_id, user_id, created_by)
  VALUES (p_league_id, v_user_id, auth.uid())
  ON CONFLICT DO NOTHING;

  -- If league had no primary admin yet, set this user as primary
  UPDATE public.leagues
  SET admin_user_id = v_user_id
  WHERE id = p_league_id
    AND admin_user_id IS NULL;

  RETURN QUERY
  SELECT
    la.user_id,
    u.email::TEXT,
    (l.admin_user_id IS NOT NULL AND l.admin_user_id = la.user_id) AS is_primary,
    la.created_at
  FROM public.league_admins la
  JOIN auth.users u ON u.id = la.user_id
  JOIN public.leagues l ON l.id = la.league_id
  WHERE la.league_id = p_league_id
    AND la.user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_league_admin(
  p_league_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count INTEGER;
  v_primary UUID;
  v_next_primary UUID;
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'Only league admins can remove admins';
  END IF;

  SELECT admin_user_id INTO v_primary
  FROM public.leagues
  WHERE id = p_league_id;

  SELECT COUNT(*)::INTEGER INTO v_admin_count
  FROM public.league_admins
  WHERE league_id = p_league_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.league_admins
    WHERE league_id = p_league_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Admin not found for this league';
  END IF;

  IF v_admin_count <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last league admin';
  END IF;

  -- If removing the primary admin, promote the next earliest admin
  IF v_primary IS NOT NULL AND p_user_id = v_primary THEN
    SELECT la.user_id INTO v_next_primary
    FROM public.league_admins la
    WHERE la.league_id = p_league_id
      AND la.user_id <> p_user_id
    ORDER BY la.created_at ASC
    LIMIT 1;

    UPDATE public.leagues
    SET admin_user_id = v_next_primary
    WHERE id = p_league_id;
  END IF;

  DELETE FROM public.league_admins
  WHERE league_id = p_league_id
    AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_league_admins(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_league_admin_by_email(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_league_admin(UUID, UUID) TO anon, authenticated;
