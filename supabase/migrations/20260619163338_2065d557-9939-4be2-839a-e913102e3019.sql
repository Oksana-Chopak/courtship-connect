-- ISSUE 1: profiles direct access -> own row only
GRANT SELECT ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles visible to authenticated" ON public.profiles;
DROP POLICY IF EXISTS "users select own profile"          ON public.profiles;
DROP POLICY IF EXISTS "users read own profile"            ON public.profiles;

CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

ALTER VIEW public.profiles_public SET (security_invoker = false);
GRANT SELECT ON public.profiles_public TO authenticated, anon;

-- ISSUE 2 + 3: event_requests contact/swish_number
REVOKE SELECT (swish_number, contact) ON public.event_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_event_contact(_event_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _contact text; _host uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT host_id, contact INTO _host, _contact
    FROM public.event_requests WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _host = _uid
     OR EXISTS (SELECT 1 FROM public.event_attendees WHERE event_id = _event_id AND user_id = _uid)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND is_admin)
  THEN RETURN _contact; END IF;
  RAISE EXCEPTION 'forbidden';
END $$;

GRANT EXECUTE ON FUNCTION public.get_event_contact(uuid) TO authenticated;