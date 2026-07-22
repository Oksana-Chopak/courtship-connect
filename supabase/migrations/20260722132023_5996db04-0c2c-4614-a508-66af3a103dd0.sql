ALTER TABLE public.sos_requests ADD COLUMN IF NOT EXISTS booking_link text;

CREATE OR REPLACE FUNCTION public.set_booking_link(_sos_id uuid, _url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _clean text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sos_requests WHERE id = _sos_id AND caller_id = _uid) THEN
    RAISE EXCEPTION 'not_host';
  END IF;
  _clean := nullif(btrim(coalesce(_url, '')), '');
  IF _clean IS NOT NULL THEN
    IF length(_clean) > 500 THEN RAISE EXCEPTION 'link_too_long'; END IF;
    IF _clean !~* '^https?://' THEN RAISE EXCEPTION 'link_not_http'; END IF;
  END IF;
  UPDATE public.sos_requests SET booking_link = _clean WHERE id = _sos_id;
END $$;
REVOKE ALL ON FUNCTION public.set_booking_link(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_booking_link(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pick_applicant(_sos_id uuid, _applicant uuid)
RETURNS TABLE(ok boolean, reason text, game_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _sos public.sos_requests; _game_id uuid; _new_filled int;
  _host_name text; _court text; _prop timestamptz; _final_at timestamptz; _pref text;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text, NULL::uuid; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid; RETURN; END IF;
  IF _sos.caller_id <> _uid THEN RETURN QUERY SELECT false, 'not_host'::text, NULL::uuid; RETURN; END IF;
  IF _sos.status NOT IN ('active', 'claimed') THEN
    RETURN QUERY SELECT false, 'taken'::text, NULL::uuid; RETURN;
  END IF;
  IF coalesce(_sos.play_until, _sos.play_at) < now() THEN
    IF _sos.status = 'active' THEN
      UPDATE public.sos_requests SET status = 'expired' WHERE id = _sos_id;
    END IF;
    RETURN QUERY SELECT false, 'expired'::text, NULL::uuid; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sos_applications a WHERE a.sos_id = _sos_id AND a.applicant_id = _applicant AND a.status = 'pending') THEN
    RETURN QUERY SELECT false, 'no_application'::text, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.games g WHERE g.sos_id = _sos_id AND (g.player_a = _applicant OR g.player_b = _applicant)) THEN
    RETURN QUERY SELECT false, 'already_in'::text, NULL::uuid; RETURN;
  END IF;
  SELECT proposed_at, ct_pref INTO _prop, _pref FROM public.sos_applications
   WHERE sos_id = _sos_id AND applicant_id = _applicant AND status = 'pending';
  _final_at := CASE
    WHEN _sos.play_until IS NOT NULL AND _prop IS NOT NULL
         AND _prop >= _sos.play_at AND _prop <= _sos.play_until AND _prop >= now()
    THEN _prop ELSE _sos.play_at END;
  INSERT INTO public.games (player_a, player_b, played_at, sos_id)
  VALUES (_sos.caller_id, _applicant, _final_at, _sos_id)
  RETURNING id INTO _game_id;
  _new_filled := coalesce(_sos.spots_filled, 0) + 1;
  UPDATE public.sos_requests
     SET spots_filled = _new_filled,
         spots_needed = GREATEST(coalesce(spots_needed, 1), _new_filled),
         claimed_by = _applicant,
         play_at = _final_at,
         play_until = CASE WHEN _new_filled >= coalesce(spots_needed, 1) THEN NULL ELSE play_until END,
         court_type = CASE WHEN court_type_any AND _pref IN ('indoor','outdoor') THEN _pref::court_type_t ELSE court_type END,
         court_type_any = CASE WHEN court_type_any AND _pref IN ('indoor','outdoor') THEN false ELSE court_type_any END,
         status = CASE WHEN _new_filled >= coalesce(spots_needed, 1) THEN 'claimed'::sos_status_t ELSE 'active'::sos_status_t END
   WHERE id = _sos_id;
  UPDATE public.profiles SET rescues_count = rescues_count + 1 WHERE id = _applicant;
  UPDATE public.sos_applications SET status = 'picked' WHERE sos_id = _sos_id AND applicant_id = _applicant;
  SELECT name INTO _host_name FROM public.profiles WHERE id = _sos.caller_id;
  SELECT name INTO _court FROM public.courts WHERE id = _sos.court_id;
  PERFORM public._push_users(
    ARRAY[_applicant],
    '🎾 You''re in! ' || coalesce(_host_name, 'The host') || ' picked you',
    coalesce(_court, 'Your game') ||
      CASE WHEN _final_at IS NOT NULL THEN ' · ' || to_char(_final_at AT TIME ZONE 'Europe/Stockholm', 'Dy HH24:MI') ELSE '' END ||
      ' — tap for details and say hi.',
    '/sos/' || _sos_id::text,
    'picked-' || _sos_id::text
  );
  RETURN QUERY SELECT true, 'ok'::text, _game_id;
END $$;
GRANT EXECUTE ON FUNCTION public.pick_applicant(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_applicants(_sos_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _losers uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sos_requests WHERE id = _sos_id AND caller_id = _uid) THEN
    RAISE EXCEPTION 'not_host';
  END IF;
  SELECT coalesce(array_agg(applicant_id), '{}') INTO _losers
    FROM public.sos_applications WHERE sos_id = _sos_id AND status = 'pending';
  IF coalesce(array_length(_losers, 1), 0) = 0 THEN RETURN 0; END IF;
  UPDATE public.sos_applications SET status = 'declined' WHERE sos_id = _sos_id AND status = 'pending';
  PERFORM public._push_users(_losers, 'This one''s taken 💔', 'Stay ready — new games pop up every week 🎾', '/board', 'declined-' || _sos_id::text);
  RETURN coalesce(array_length(_losers, 1), 0);
END $$;
REVOKE ALL ON FUNCTION public.release_applicants(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.release_applicants(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';