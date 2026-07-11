ALTER TABLE public.sos_requests
  ADD COLUMN IF NOT EXISTS play_until timestamptz NULL;

ALTER TABLE public.sos_applications
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz NULL;

COMMENT ON COLUMN public.sos_requests.play_until IS
  'Flexible-time window end. NULL = exact-time game (play_at is the time). Set = host can play anytime play_at..play_until.';
COMMENT ON COLUMN public.sos_applications.proposed_at IS
  'Applicant''s counter-proposal for windowed games: the concrete time they can play (must be within the window).';

DROP FUNCTION IF EXISTS public.apply_to_game(uuid);
CREATE OR REPLACE FUNCTION public.apply_to_game(_sos_id uuid, _proposed_at timestamptz DEFAULT NULL)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests; _name text; _prop_txt text;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  IF _sos.caller_id = _uid THEN RETURN QUERY SELECT false, 'own_sos'::text; RETURN; END IF;
  IF _sos.kind <> 'open' THEN RETURN QUERY SELECT false, 'not_applicable'::text; RETURN; END IF;
  IF _sos.status <> 'active' THEN RETURN QUERY SELECT false, 'taken'::text; RETURN; END IF;
  IF coalesce(_sos.play_until, _sos.play_at) < now() THEN
    UPDATE public.sos_requests SET status = 'expired' WHERE id = _sos_id;
    RETURN QUERY SELECT false, 'expired'::text; RETURN;
  END IF;
  IF _proposed_at IS NOT NULL THEN
    IF _sos.play_until IS NULL THEN
      _proposed_at := NULL;
    ELSIF _proposed_at < _sos.play_at OR _proposed_at > _sos.play_until OR _proposed_at < now() THEN
      RETURN QUERY SELECT false, 'bad_proposed_time'::text; RETURN;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.games g WHERE g.sos_id = _sos_id AND (g.player_a = _uid OR g.player_b = _uid)) THEN
    RETURN QUERY SELECT false, 'already_in'::text; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sos_applications a WHERE a.sos_id = _sos_id AND a.applicant_id = _uid AND a.status = 'pending') THEN
    UPDATE public.sos_applications SET proposed_at = _proposed_at
     WHERE sos_id = _sos_id AND applicant_id = _uid AND status = 'pending';
    RETURN QUERY SELECT false, 'already_applied'::text; RETURN;
  END IF;
  INSERT INTO public.sos_applications (sos_id, applicant_id, status, proposed_at)
  VALUES (_sos_id, _uid, 'pending', _proposed_at)
  ON CONFLICT (sos_id, applicant_id) DO UPDATE SET status = 'pending', created_at = now(), proposed_at = EXCLUDED.proposed_at;
  SELECT name INTO _name FROM public.profiles WHERE id = _uid;
  _prop_txt := CASE WHEN _proposed_at IS NOT NULL
    THEN ' Suggests ' || to_char(_proposed_at AT TIME ZONE 'Europe/Stockholm', 'Dy HH24:MI') || '.'
    ELSE '' END;
  PERFORM public._push_users(
    ARRAY[_sos.caller_id],
    '🙋 ' || coalesce(_name, 'A player') || ' wants in!',
    'Your planned game has a new candidate.' || _prop_txt || ' Tap to pick your partner.',
    '/sos/' || _sos_id::text,
    'apply-' || _sos_id::text
  );
  RETURN QUERY SELECT true, 'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.apply_to_game(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_to_game(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.pick_applicant(_sos_id uuid, _applicant uuid)
RETURNS TABLE(ok boolean, reason text, game_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _sos public.sos_requests;
  _game_id uuid;
  _new_filled int;
  _host_name text; _court text; _losers uuid[];
  _prop timestamptz; _final_at timestamptz;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text, NULL::uuid; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid; RETURN; END IF;
  IF _sos.caller_id <> _uid THEN RETURN QUERY SELECT false, 'not_host'::text, NULL::uuid; RETURN; END IF;
  IF _sos.status <> 'active' THEN RETURN QUERY SELECT false, 'taken'::text, NULL::uuid; RETURN; END IF;
  IF coalesce(_sos.play_until, _sos.play_at) < now() THEN
    UPDATE public.sos_requests SET status = 'expired' WHERE id = _sos_id;
    RETURN QUERY SELECT false, 'expired'::text, NULL::uuid; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sos_applications a WHERE a.sos_id = _sos_id AND a.applicant_id = _applicant AND a.status = 'pending') THEN
    RETURN QUERY SELECT false, 'no_application'::text, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.games g WHERE g.sos_id = _sos_id AND (g.player_a = _applicant OR g.player_b = _applicant)) THEN
    RETURN QUERY SELECT false, 'already_in'::text, NULL::uuid; RETURN;
  END IF;
  SELECT proposed_at INTO _prop FROM public.sos_applications
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
     SET spots_filled = _new_filled, claimed_by = _applicant,
         play_at = _final_at,
         play_until = CASE WHEN _new_filled >= coalesce(spots_needed, 1) THEN NULL ELSE play_until END,
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
  IF _new_filled >= coalesce(_sos.spots_needed, 1) THEN
    SELECT coalesce(array_agg(applicant_id), '{}') INTO _losers
      FROM public.sos_applications
     WHERE sos_id = _sos_id AND status = 'pending';
    UPDATE public.sos_applications SET status = 'declined'
     WHERE sos_id = _sos_id AND status = 'pending';
    PERFORM public._push_users(
      _losers,
      'This one''s taken 💔',
      'Stay ready — new games pop up every week 🎾',
      '/board',
      'declined-' || _sos_id::text
    );
  END IF;
  RETURN QUERY SELECT true, 'ok'::text, _game_id;
END $$;
REVOKE ALL ON FUNCTION public.pick_applicant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_applicant(uuid, uuid) TO authenticated;

notify pgrst, 'reload schema';