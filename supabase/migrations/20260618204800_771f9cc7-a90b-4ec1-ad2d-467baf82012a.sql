
ALTER TABLE public.event_requests ADD COLUMN IF NOT EXISTS swish_number text;
ALTER TABLE public.event_requests ADD COLUMN IF NOT EXISTS spots_taken int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.event_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.event_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'interested',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_attendees TO authenticated;
GRANT ALL ON public.event_attendees TO service_role;

ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_attendees_select ON public.event_attendees;
CREATE POLICY event_attendees_select ON public.event_attendees FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.event_requests e WHERE e.id = event_id AND e.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS event_attendees_update ON public.event_attendees;
CREATE POLICY event_attendees_update ON public.event_attendees FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_requests e WHERE e.id = event_id AND e.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)) WITH CHECK (true);

DROP POLICY IF EXISTS event_attendees_delete ON public.event_attendees;
CREATE POLICY event_attendees_delete ON public.event_attendees FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.join_event(_event_id uuid)
RETURNS TABLE(ok boolean, reason text, attendee_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ev public.event_requests; _st text;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false,'not_authenticated'::text,NULL::text; RETURN; END IF;
  SELECT * INTO _ev FROM public.event_requests WHERE id=_event_id FOR UPDATE;
  IF NOT FOUND OR _ev.status<>'approved' THEN RETURN QUERY SELECT false,'not_found'::text,NULL::text; RETURN; END IF;
  IF _ev.starts_at < now() THEN RETURN QUERY SELECT false,'past'::text,NULL::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.event_attendees WHERE event_id=_event_id AND user_id=_uid)
    THEN RETURN QUERY SELECT false,'already_in'::text,NULL::text; RETURN; END IF;
  IF _ev.capacity IS NOT NULL AND _ev.spots_taken >= _ev.capacity
    THEN RETURN QUERY SELECT false,'full'::text,NULL::text; RETURN; END IF;
  _st := CASE WHEN COALESCE(_ev.price_sek,0) > 0 THEN 'booked' ELSE 'interested' END;
  INSERT INTO public.event_attendees (event_id,user_id,status) VALUES (_event_id,_uid,_st);
  UPDATE public.event_requests SET spots_taken = spots_taken + 1 WHERE id=_event_id;
  RETURN QUERY SELECT true,'ok'::text,_st;
END; $$;
GRANT EXECUTE ON FUNCTION public.join_event(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_event(_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _n int;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  DELETE FROM public.event_attendees WHERE event_id=_event_id AND user_id=_uid;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n > 0 THEN UPDATE public.event_requests SET spots_taken = GREATEST(0, spots_taken - 1) WHERE id=_event_id; END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.leave_event(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_invite_codes()
RETURNS TABLE(code text, uses_remaining int, active boolean, created_at timestamptz, signups int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT ic.code, ic.uses_remaining, ic.active, ic.created_at,
         (SELECT COUNT(*)::int FROM public.profiles p WHERE upper(COALESCE(p.signup_code,'')) = ic.code)
  FROM public.invite_codes ic
  WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
  ORDER BY ic.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_invite_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_invite_code(_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
    THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.invite_codes WHERE code = upper(trim(_code));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_invite_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_players_list()
RETURNS TABLE(id uuid, name text, home_city text, signup_code text, rescues_count int, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.home_city, p.signup_code, p.rescues_count::int, p.created_at
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
  ORDER BY p.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_players_list() TO authenticated;
