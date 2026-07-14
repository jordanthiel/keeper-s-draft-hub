-- Allow team managers to enter just their 6-digit code (no league id required).
-- Access codes are unique across all leagues.

CREATE OR REPLACE FUNCTION public.verify_team_access_by_code(p_access_code TEXT)
RETURNS TABLE (
  id UUID,
  league_id UUID,
  league_name TEXT,
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
  SELECT
    t.id,
    t.league_id,
    l.name AS league_name,
    t.name,
    t.draft_position,
    t.email,
    t.created_at
  FROM public.teams t
  JOIN public.team_credentials c ON c.team_id = t.id
  JOIN public.leagues l ON l.id = t.league_id
  WHERE c.access_code = p_access_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_team_access_by_code(TEXT) TO anon, authenticated;
