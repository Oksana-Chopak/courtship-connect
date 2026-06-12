
ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT ON public.courts TO authenticated;
GRANT ALL ON public.courts TO service_role;

DROP POLICY IF EXISTS "courts insert by authenticated" ON public.courts;
CREATE POLICY "courts insert by authenticated"
  ON public.courts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND is_custom = true
    AND hidden = false
    AND length(trim(name)) BETWEEN 2 AND 80
    AND city IN ('Uppsala','Stockholm')
  );

-- Admin: hide / unhide a custom court (soft-hide).
CREATE OR REPLACE FUNCTION public.admin_set_court_hidden(_court_id uuid, _hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE courts SET hidden = _hidden WHERE id = _court_id AND is_custom = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_court(_court_id uuid, _name text, _area text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE courts
    SET name = COALESCE(NULLIF(trim(_name),''), name),
        area = NULLIF(trim(_area),'')
    WHERE id = _court_id AND is_custom = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_courts_list()
RETURNS TABLE(
  id uuid, name text, area text, city text, hidden boolean,
  created_by uuid, creator_name text, usage_count bigint, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.area, c.city, c.hidden, c.created_by,
         p.name AS creator_name,
         (SELECT count(*) FROM sos_requests s WHERE s.court_id = c.id) AS usage_count,
         c.created_at
  FROM courts c
  LEFT JOIN profiles p ON p.id = c.created_by
  WHERE c.is_custom = true
  ORDER BY c.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_court_hidden(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_court(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_courts_list() TO authenticated;
