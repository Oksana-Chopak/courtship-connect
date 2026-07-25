ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_level text NOT NULL DEFAULT 'important'
  CHECK (email_level IN ('all', 'important', 'off'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_digest boolean NOT NULL DEFAULT true;
UPDATE public.profiles SET email_level = 'off' WHERE email_notifs = false AND email_level = 'important';

DROP FUNCTION IF EXISTS public._push_users(uuid[], text, text, text, text);
CREATE FUNCTION public._push_users(_ids uuid[], _title text, _body text, _url text, _tag text, _kind text DEFAULT 'critical')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN; END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/notify-users',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
      ),
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag, 'kind', coalesce(_kind, 'critical'))
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    PERFORM net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/email-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
      ),
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag, 'kind', coalesce(_kind, 'critical'))
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

CREATE OR REPLACE FUNCTION public.do_swipe(_target uuid, _like boolean)
RETURNS TABLE(is_match boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _match boolean := false; _my_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _uid = _target THEN RAISE EXCEPTION 'self'; END IF;
  INSERT INTO public.swipes (liker_id, target_id, liked)
  VALUES (_uid, _target, _like)
  ON CONFLICT (liker_id, target_id) DO UPDATE SET liked = EXCLUDED.liked, created_at = now();
  IF _like THEN
    SELECT EXISTS (
      SELECT 1 FROM public.swipes s
       WHERE s.liker_id = _target AND s.target_id = _uid AND s.liked = true
    ) INTO _match;
    IF _match THEN
      PERFORM public._add_buddy(_uid, _target, 'manual');
      SELECT name INTO _my_name FROM public.profiles WHERE id = _uid;
      PERFORM public._push_users(
        ARRAY[_target],
        '💘 It''s a match. Literally.',
        coalesce(_my_name, 'Someone') || ' would play you too — you''re buddies now. Plan a game! 🎾',
        '/players/' || _uid::text,
        'crush-' || _uid::text,
        'social'
      );
    END IF;
  END IF;
  RETURN QUERY SELECT _match;
END $$;
GRANT EXECUTE ON FUNCTION public.do_swipe(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_buddy(_other uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _name text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _me = _other THEN RAISE EXCEPTION 'cannot_buddy_self'; END IF;
  IF public.is_buddy(_me, _other) THEN RETURN; END IF;
  INSERT INTO public.buddy_requests (from_id, to_id) VALUES (_me, _other)
  ON CONFLICT (from_id, to_id) DO UPDATE SET status = 'pending', created_at = now();
  SELECT name INTO _name FROM public.profiles WHERE id = _me;
  PERFORM public._push_users(
    array[_other],
    '🤗 ' || coalesce(_name, 'A player') || ' wants to be your court buddy',
    'Accept and you can ping each other for games anytime.',
    '/players', 'buddyreq-' || _me::text,
    'social');
END; $$;
GRANT EXECUTE ON FUNCTION public.request_buddy(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_buddy_request(_req_id uuid, _accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _r public.buddy_requests; _name text;
BEGIN
  SELECT * INTO _r FROM public.buddy_requests WHERE id = _req_id FOR UPDATE;
  IF NOT FOUND OR _r.to_id <> _me THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _accept THEN
    PERFORM public._add_buddy(_r.from_id, _r.to_id, 'manual');
    UPDATE public.buddy_requests SET status = 'accepted' WHERE id = _req_id;
    SELECT name INTO _name FROM public.profiles WHERE id = _me;
    PERFORM public._push_users(
      array[_r.from_id],
      '🎾 ' || coalesce(_name, 'Your invite') || ' accepted — you''re court buddies!',
      'Ping them for a game whenever you''re free.',
      '/players', 'buddyok-' || _req_id::text,
      'social');
  ELSE
    UPDATE public.buddy_requests SET status = 'declined' WHERE id = _req_id;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.respond_buddy_request(uuid, boolean) TO authenticated;

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
  PERFORM public._push_users(_losers, 'This one''s taken 💔', 'Stay ready — new games pop up every week 🎾', '/board', 'declined-' || _sos_id::text, 'social');
  RETURN coalesce(array_length(_losers, 1), 0);
END $$;
REVOKE ALL ON FUNCTION public.release_applicants(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.release_applicants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.weekly_recap_push()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _n int := 0; _wk_start timestamptz; _title text; _body text;
BEGIN
  _wk_start := date_trunc('week', now() AT TIME ZONE 'Europe/Stockholm') - interval '7 days';
  FOR _r IN
    WITH last_week AS (
      SELECT p.id,
             count(g.id) FILTER (
               WHERE (g.played_at AT TIME ZONE 'Europe/Stockholm') >= _wk_start
                 AND (g.played_at AT TIME ZONE 'Europe/Stockholm') <  _wk_start + interval '7 days'
                 AND g.confirmed_a AND g.confirmed_b
             ) AS games_last_week
      FROM public.profiles p
      LEFT JOIN public.games g
        ON (g.player_a = p.id OR g.player_b = p.id)
      GROUP BY p.id
    )
    SELECT id, games_last_week FROM last_week WHERE games_last_week > 0
  LOOP
    _title := '📈 Your week on court';
    _body := CASE
      WHEN _r.games_last_week = 1 THEN 'You played 1 game last week. Your season keeps growing — see where you stand 🎾'
      ELSE 'You played ' || _r.games_last_week || ' games last week. Your season keeps growing — see where you stand 🎾'
    END;
    PERFORM public._push_users(ARRAY[_r.id], _title, _body, '/progress', 'recap-' || to_char(now(), 'IYYY-IW'), 'digest');
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END; $$;

DROP FUNCTION IF EXISTS public.cancel_game(uuid);
CREATE FUNCTION public.cancel_game(_sos_id uuid)
RETURNS TABLE(claimer_ids uuid[], applicant_ids uuid[], notified boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ids uuid[]; _apps uuid[]; _host text; _court text; _when text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sos_requests WHERE id = _sos_id AND caller_id = _uid) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT g.player_b), '{}') INTO _ids
    FROM public.games g WHERE g.sos_id = _sos_id AND g.player_b <> _uid;
  SELECT COALESCE(array_agg(a.applicant_id), '{}') INTO _apps
    FROM public.sos_applications a WHERE a.sos_id = _sos_id AND a.status = 'pending';
  UPDATE public.sos_applications SET status = 'declined' WHERE sos_id = _sos_id AND status = 'pending';
  UPDATE public.sos_requests SET status = 'cancelled' WHERE id = _sos_id AND caller_id = _uid;
  DELETE FROM public.games WHERE sos_id = _sos_id AND confirmed_a = false AND confirmed_b = false;
  SELECT p.name INTO _host FROM public.profiles p WHERE p.id = _uid;
  SELECT c.name, to_char(s.play_at AT TIME ZONE 'Europe/Stockholm', 'Dy DD Mon HH24:MI')
    INTO _court, _when
    FROM public.sos_requests s LEFT JOIN public.courts c ON c.id = s.court_id
   WHERE s.id = _sos_id;
  PERFORM public._push_users(_ids,
    '❌ ' || coalesce(_host, 'The host') || ' cancelled the game',
    coalesce(_court, 'Your game') || coalesce(' · ' || _when, '') || ' is off. The board has more 🎾',
    '/board', 'cancel-' || _sos_id::text, 'critical');
  PERFORM public._push_users(_apps,
    '❌ That game was cancelled',
    'The host called off ' || coalesce(_court, 'the game') || ' — your application is closed. New games pop up daily 🎾',
    '/board', 'cancelapp-' || _sos_id::text, 'critical');
  RETURN QUERY SELECT _ids, _apps, true;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_game(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_claim(_sos_id uuid)
RETURNS TABLE(ok boolean, re_flared boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests; _refire boolean:=false; _had_game boolean; _who text;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false,false,'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id=_sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,false,'not_found'::text; RETURN; END IF;
  IF COALESCE(_sos.play_until, _sos.play_at)<=now() THEN RETURN QUERY SELECT false,false,'already_played'::text; RETURN; END IF;
  SELECT EXISTS(SELECT 1 FROM public.games WHERE sos_id=_sos_id
     AND ((player_a=_sos.caller_id AND player_b=_uid) OR (player_a=_uid AND player_b=_sos.caller_id))
     AND confirmed_a=false AND confirmed_b=false) INTO _had_game;
  IF NOT _had_game THEN RETURN QUERY SELECT false,false,'not_claimant'::text; RETURN; END IF;
  DELETE FROM public.games WHERE sos_id=_sos_id
     AND ((player_a=_sos.caller_id AND player_b=_uid) OR (player_a=_uid AND player_b=_sos.caller_id))
     AND confirmed_a=false AND confirmed_b=false;
  UPDATE public.profiles SET rescues_count=GREATEST(0,rescues_count-1) WHERE id=_uid;
  IF _sos.play_until IS NULL AND _sos.play_at<=now()+interval '7 hours' THEN
    _refire:=true;
    UPDATE public.sos_requests SET spots_filled=GREATEST(0,COALESCE(spots_filled,1)-1),
      status='active', kind='sos', flared_at=now(),
      claimed_by=CASE WHEN claimed_by=_uid THEN NULL ELSE claimed_by END WHERE id=_sos_id;
  ELSE
    UPDATE public.sos_requests SET spots_filled=GREATEST(0,COALESCE(spots_filled,1)-1),
      status='active', claimed_by=CASE WHEN claimed_by=_uid THEN NULL ELSE claimed_by END WHERE id=_sos_id;
  END IF;
  SELECT name INTO _who FROM public.profiles WHERE id=_uid;
  PERFORM public._push_users(ARRAY[_sos.caller_id],
    '😔 ' || coalesce(_who, 'Your partner') || ' can''t make it',
    CASE WHEN _refire
      THEN 'They pulled out — your game is back on the board as an SOS. Rescuers are being pinged 🚨'
      ELSE 'They pulled out — your game is open on the board again. Candidates can still apply 🎾'
    END,
    '/sos/' || _sos_id::text, 'withdraw-' || _sos_id::text, 'critical');
  RETURN QUERY SELECT true,_refire,'ok'::text;
END; $$;
GRANT EXECUTE ON FUNCTION public.withdraw_claim(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';