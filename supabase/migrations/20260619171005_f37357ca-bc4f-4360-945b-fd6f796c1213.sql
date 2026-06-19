-- A) players_directory
CREATE OR REPLACE FUNCTION public.players_directory(_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id uuid, name text, last_name text, photo_url text, level int,
  formats text[], play_times text[], vibe vibe_t, looking_for looking_for_t,
  home_courts text, home_city text, home_cities text[], buddy_optin buddy_optin_t,
  buddy_radius_km int, rescues_count int, ghost_badge boolean,
  bio text, fav_shot text, games_played int, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, last_name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, bio, fav_shot, games_played, created_at
    FROM public.profiles
   WHERE (_ids IS NULL OR id = ANY(_ids));
$$;
REVOKE ALL ON FUNCTION public.players_directory(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.players_directory(uuid[]) TO authenticated;

-- B) Drop profiles_public view
DROP VIEW IF EXISTS public.profiles_public;

-- C) event_requests insert must be pending
DROP POLICY IF EXISTS event_requests_insert ON public.event_requests;
CREATE POLICY event_requests_insert ON public.event_requests
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid() AND status = 'pending');

-- D) Invite usage enforcement + decrement
CREATE OR REPLACE FUNCTION public.enforce_invite_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN RETURN NEW; END IF;
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  _code := upper(trim(COALESCE(NEW.signup_code,
                               (auth.jwt() -> 'user_metadata' ->> 'signup_code'))));
  IF _code IS NULL OR _code = '' THEN RAISE EXCEPTION 'invite_required'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.invite_codes
                  WHERE code = _code AND active = true AND uses_remaining > 0) INTO _ok;
  IF NOT _ok THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  UPDATE public.invite_codes SET uses_remaining = GREATEST(0, uses_remaining - 1) WHERE code = _code;
  NEW.signup_code := _code;
  RETURN NEW;
END $$;

-- E) Move sensitive event fields to event_private
CREATE TABLE IF NOT EXISTS public.event_private (
  event_id uuid PRIMARY KEY REFERENCES public.event_requests(id) ON DELETE CASCADE,
  swish_number text,
  contact text
);
ALTER TABLE public.event_private ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.event_private TO authenticated;
GRANT ALL ON public.event_private TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='event_requests' AND column_name='swish_number') THEN
    INSERT INTO public.event_private (event_id, swish_number, contact)
      SELECT id, swish_number, contact FROM public.event_requests
       WHERE swish_number IS NOT NULL OR contact IS NOT NULL
      ON CONFLICT (event_id) DO UPDATE
        SET swish_number = EXCLUDED.swish_number, contact = EXCLUDED.contact;
  END IF;
END $$;

DROP POLICY IF EXISTS event_private_rw ON public.event_private;
CREATE POLICY event_private_rw ON public.event_private FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_requests e WHERE e.id = event_id AND e.host_id = auth.uid())
         OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_requests e WHERE e.id = event_id AND e.host_id = auth.uid())
         OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

CREATE OR REPLACE FUNCTION public.get_event_swish(_event_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _val text; _host uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT e.host_id, p.swish_number INTO _host, _val
    FROM public.event_requests e LEFT JOIN public.event_private p ON p.event_id = e.id
   WHERE e.id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _host = _uid
     OR EXISTS (SELECT 1 FROM public.event_attendees WHERE event_id = _event_id AND user_id = _uid)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND is_admin)
  THEN RETURN _val; END IF;
  RAISE EXCEPTION 'forbidden';
END $$;
GRANT EXECUTE ON FUNCTION public.get_event_swish(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_event_contact(_event_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _val text; _host uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT e.host_id, p.contact INTO _host, _val
    FROM public.event_requests e LEFT JOIN public.event_private p ON p.event_id = e.id
   WHERE e.id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _host = _uid
     OR EXISTS (SELECT 1 FROM public.event_attendees WHERE event_id = _event_id AND user_id = _uid)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND is_admin)
  THEN RETURN _val; END IF;
  RAISE EXCEPTION 'forbidden';
END $$;
GRANT EXECUTE ON FUNCTION public.get_event_contact(uuid) TO authenticated;

ALTER TABLE public.event_requests DROP COLUMN IF EXISTS swish_number;
ALTER TABLE public.event_requests DROP COLUMN IF EXISTS contact;