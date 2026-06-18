
-- Profiles: defense-in-depth column-level revoke
REVOKE SELECT (phone_e164, is_admin, signup_code) ON public.profiles FROM anon, authenticated;

-- Event attendees: explicit INSERT policy + tightened UPDATE WITH CHECK
DROP POLICY IF EXISTS event_attendees_insert ON public.event_attendees;
CREATE POLICY event_attendees_insert ON public.event_attendees FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS event_attendees_update ON public.event_attendees;
CREATE POLICY event_attendees_update ON public.event_attendees FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_requests e WHERE e.id = event_id AND e.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_requests e WHERE e.id = event_id AND e.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- Event requests: hide swish_number at column level; expose via secured RPC
REVOKE SELECT (swish_number) ON public.event_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_event_swish(_event_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _swish text; _host uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT host_id, swish_number INTO _host, _swish
    FROM public.event_requests WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _host = _uid
     OR EXISTS (SELECT 1 FROM public.event_attendees
                 WHERE event_id = _event_id AND user_id = _uid)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND is_admin)
  THEN
    RETURN _swish;
  END IF;
  RAISE EXCEPTION 'forbidden';
END $$;
GRANT EXECUTE ON FUNCTION public.get_event_swish(uuid) TO authenticated;
