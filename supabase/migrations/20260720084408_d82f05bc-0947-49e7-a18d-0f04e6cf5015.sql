-- ═══════════════════════════════════════════════════════════════════
-- APPLY_2026-07-20 · ОДНА вставка = всі 4 pending-батчі + перевірка
-- ═══════════════════════════════════════════════════════════════════

-- ▌PART 1/4 · HOTFIX_signup_and_contact
GRANT EXECUTE ON FUNCTION public.check_invite_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_contact_phone(_target uuid)
RETURNS TABLE(phone text, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := auth.uid(); _p text; _n text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _me = _target
     OR public.is_buddy(_me, _target)
     OR EXISTS (
       SELECT 1 FROM public.games g
        WHERE (g.player_a = _me AND g.player_b = _target)
           OR (g.player_a = _target AND g.player_b = _me)
     ) THEN
    SELECT p.phone_e164, p.name INTO _p, _n FROM public.profiles p WHERE p.id = _target;
    IF _p IS NULL OR btrim(_p) = '' THEN RAISE EXCEPTION 'no_number'; END IF;
    RETURN QUERY SELECT _p, _n;
    RETURN;
  END IF;
  RAISE EXCEPTION 'forbidden';
END $$;
REVOKE ALL ON FUNCTION public.get_contact_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_phone(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ▌PART 2/4 · email_channel
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifs boolean NOT NULL DEFAULT true;

create or replace function public._push_users(_ids uuid[], _title text, _body text, _url text, _tag text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if _ids is null or array_length(_ids, 1) is null then return; end if;
  begin
    perform net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/notify-users',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
      ),
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag)
    );
  exception when others then null; end;
  begin
    perform net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/email-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
      ),
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag)
    );
  exception when others then null; end;
end;
$$;

create or replace function public.request_buddy(_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _name text;
begin
  if _me is null then raise exception 'not_authenticated'; end if;
  if _me = _other then raise exception 'cannot_buddy_self'; end if;
  if public.is_buddy(_me, _other) then return; end if;
  insert into public.buddy_requests (from_id, to_id) values (_me, _other)
  on conflict (from_id, to_id) do update set status = 'pending', created_at = now();
  select name into _name from public.profiles where id = _me;
  perform public._push_users(
    array[_other],
    '🤗 ' || coalesce(_name, 'A player') || ' wants to be your court buddy',
    'Accept and you can ping each other for games anytime.',
    '/players', 'buddyreq-' || _me::text);
end; $$;
GRANT EXECUTE ON FUNCTION public.request_buddy(uuid) TO authenticated;

create or replace function public.respond_buddy_request(_req_id uuid, _accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _r public.buddy_requests; _name text;
begin
  select * into _r from public.buddy_requests where id = _req_id for update;
  if not found or _r.to_id <> _me then raise exception 'not_found'; end if;
  if _accept then
    perform public._add_buddy(_r.from_id, _r.to_id, 'manual');
    update public.buddy_requests set status = 'accepted' where id = _req_id;
    select name into _name from public.profiles where id = _me;
    perform public._push_users(
      array[_r.from_id],
      '🎾 ' || coalesce(_name, 'Your invite') || ' accepted — you''re court buddies!',
      'Ping them for a game whenever you''re free.',
      '/players', 'buddyok-' || _req_id::text);
  else
    update public.buddy_requests set status = 'declined' where id = _req_id;
  end if;
end; $$;
GRANT EXECUTE ON FUNCTION public.respond_buddy_request(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ▌PART 3/4 · batch_0718
ALTER TABLE public.sos_requests ADD COLUMN IF NOT EXISTS court_type_any boolean NOT NULL DEFAULT false;
ALTER TABLE public.sos_requests ADD COLUMN IF NOT EXISTS broadcast boolean NOT NULL DEFAULT true;
ALTER TABLE public.sos_requests ADD COLUMN IF NOT EXISTS invite_join_token uuid NULL;
ALTER TABLE public.sos_applications ADD COLUMN IF NOT EXISTS ct_pref text NULL
  CHECK (ct_pref IS NULL OR ct_pref IN ('indoor','outdoor'));

DROP FUNCTION IF EXISTS public.apply_to_game(uuid);
DROP FUNCTION IF EXISTS public.apply_to_game(uuid, timestamptz);
CREATE OR REPLACE FUNCTION public.apply_to_game(_sos_id uuid, _proposed_at timestamptz DEFAULT NULL, _ct_pref text DEFAULT NULL)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests; _name text; _prop_txt text;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text; RETURN; END IF;
  IF _ct_pref IS NOT NULL AND _ct_pref NOT IN ('indoor','outdoor') THEN _ct_pref := NULL; END IF;
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
    IF _sos.play_until IS NULL THEN _proposed_at := NULL;
    ELSIF _proposed_at < _sos.play_at OR _proposed_at > _sos.play_until OR _proposed_at < now() THEN
      RETURN QUERY SELECT false, 'bad_proposed_time'::text; RETURN;
    END IF;
  END IF;
  IF NOT _sos.court_type_any THEN _ct_pref := NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.games g WHERE g.sos_id = _sos_id AND (g.player_a = _uid OR g.player_b = _uid)) THEN
    RETURN QUERY SELECT false, 'already_in'::text; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sos_applications a WHERE a.sos_id = _sos_id AND a.applicant_id = _uid AND a.status = 'pending') THEN
    UPDATE public.sos_applications SET proposed_at = _proposed_at, ct_pref = _ct_pref
     WHERE sos_id = _sos_id AND applicant_id = _uid AND status = 'pending';
    RETURN QUERY SELECT false, 'already_applied'::text; RETURN;
  END IF;
  INSERT INTO public.sos_applications (sos_id, applicant_id, status, proposed_at, ct_pref)
  VALUES (_sos_id, _uid, 'pending', _proposed_at, _ct_pref)
  ON CONFLICT (sos_id, applicant_id) DO UPDATE SET status = 'pending', created_at = now(), proposed_at = EXCLUDED.proposed_at, ct_pref = EXCLUDED.ct_pref;
  SELECT name INTO _name FROM public.profiles WHERE id = _uid;
  _prop_txt := CASE WHEN _proposed_at IS NOT NULL
    THEN ' Suggests ' || to_char(_proposed_at AT TIME ZONE 'Europe/Stockholm', 'Dy HH24:MI') || '.'
    ELSE '' END
    || CASE WHEN _ct_pref IS NOT NULL THEN ' Prefers ' || _ct_pref || '.' ELSE '' END;
  PERFORM public._push_users(
    ARRAY[_sos.caller_id],
    '🙋 ' || coalesce(_name, 'A player') || ' wants in!',
    'Your planned game has a new candidate.' || _prop_txt || ' Tap to pick your partner.',
    '/sos/' || _sos_id::text,
    'apply-' || _sos_id::text
  );
  RETURN QUERY SELECT true, 'ok'::text;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_to_game(uuid, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pick_applicant(_sos_id uuid, _applicant uuid)
RETURNS TABLE(ok boolean, reason text, game_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _sos public.sos_requests; _game_id uuid; _new_filled int;
  _host_name text; _court text; _losers uuid[]; _prop timestamptz; _final_at timestamptz; _pref text;
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
     SET spots_filled = _new_filled, claimed_by = _applicant,
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

  IF _new_filled >= coalesce(_sos.spots_needed, 1) THEN
    SELECT coalesce(array_agg(applicant_id), '{}') INTO _losers
      FROM public.sos_applications WHERE sos_id = _sos_id AND status = 'pending';
    UPDATE public.sos_applications SET status = 'declined' WHERE sos_id = _sos_id AND status = 'pending';
    PERFORM public._push_users(_losers, 'This one''s taken 💔', 'Stay ready — new games pop up every week 🎾', '/board', 'declined-' || _sos_id::text);
  END IF;

  RETURN QUERY SELECT true, 'ok'::text, _game_id;
END $$;
GRANT EXECUTE ON FUNCTION public.pick_applicant(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_game_by_token(_sos_id uuid, _token uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests; _name text; _new_filled int;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  IF _sos.invite_join_token IS NULL OR _sos.invite_join_token <> _token THEN
    RETURN QUERY SELECT false, 'bad_token'::text; RETURN; END IF;
  IF _sos.caller_id = _uid THEN RETURN QUERY SELECT false, 'own'::text; RETURN; END IF;
  IF _sos.status <> 'active' THEN RETURN QUERY SELECT false, 'taken'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.games g WHERE g.sos_id = _sos_id AND (g.player_a = _uid OR g.player_b = _uid)) THEN
    RETURN QUERY SELECT false, 'already_in'::text; RETURN; END IF;

  INSERT INTO public.games (player_a, player_b, played_at, sos_id)
  VALUES (_sos.caller_id, _uid, _sos.play_at, _sos_id);
  _new_filled := coalesce(_sos.spots_filled, 0) + 1;
  UPDATE public.sos_requests
     SET spots_filled = _new_filled, claimed_by = _uid, invite_join_token = NULL,
         status = CASE WHEN _new_filled >= coalesce(spots_needed, 1) THEN 'claimed'::sos_status_t ELSE 'active'::sos_status_t END
   WHERE id = _sos_id;
  SELECT name INTO _name FROM public.profiles WHERE id = _uid;
  PERFORM public._push_users(ARRAY[_sos.caller_id],
    '🎾 ' || coalesce(_name,'Your partner') || ' joined your game!',
    'You''re on. Tap to see details and say hi.',
    '/sos/' || _sos_id::text, 'joined-' || _sos_id::text);
  RETURN QUERY SELECT true, 'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.join_game_by_token(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_game_by_token(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.escalate_due_open_games()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n int; _r record;
BEGIN
  WITH upd AS (
    UPDATE public.sos_requests
       SET kind = 'sos', flared_at = now()
     WHERE status = 'active' AND kind = 'open' AND auto_flare = true
       AND play_until IS NULL
       AND coalesce(broadcast, true) = true
       AND play_at > now() AND play_at <= now() + interval '7 hours'
     RETURNING id
  ) SELECT count(*) INTO _n FROM upd;
  FOR _r IN
    SELECT s.id, s.caller_id FROM public.sos_requests s
     WHERE s.status='active' AND s.kind='sos' AND s.flared_at IS NOT NULL
       AND s.cancel_nudged_at IS NULL
       AND coalesce(s.broadcast, true) = true
       AND COALESCE(s.spots_filled,0) < COALESCE(s.spots_needed,1)
       AND s.play_at > now() AND s.play_at <= now() + interval '6 hours'
  LOOP
    UPDATE public.sos_requests SET cancel_nudged_at = now() WHERE id = _r.id;
    PERFORM public._push_users(ARRAY[_r.caller_id], '⏰ Still no takers',
      'Nobody grabbed your game yet. Court cancellation is usually free until 6h before — cancel now penalty-free, or keep the SOS live 🎾',
      '/sos/' || _r.id::text, 'cancel-window-' || _r.id::text);
  END LOOP;
  RETURN _n;
END; $$;

DROP FUNCTION IF EXISTS public.eligible_sos_for_me();
CREATE FUNCTION public.eligible_sos_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamptz, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamptz, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, court_type court_type_t, sport text, play_until timestamptz, ghost_name text, court_type_any boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (select id, level, buddy_optin, home_city, buddy_sos_optin from public.profiles where id = auth.uid())
  select s.id, s.caller_id, s.play_at, s.court_id, s.format, s.level_min, s.level_max,
         s.court_status, s.note, s.status, s.claimed_by, s.created_at,
         c.name, c.city, c.area,
         case when p.is_admin = true and s.ghost_name is not null then s.ghost_name else p.name end,
         public.is_buddy(s.caller_id, m.id), s.court_type, s.sport, s.play_until,
         case when p.is_admin = true then s.ghost_name else null end,
         s.court_type_any
    from public.sos_requests s cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active' and s.kind = 'sos'
     and coalesce(s.broadcast, true) = true
     and coalesce(s.play_until, s.play_at) > now()
     and s.caller_id <> m.id
     and ((m.buddy_optin <> 'no' and m.home_city = c.city and m.level between s.level_min and s.level_max)
          or (m.buddy_sos_optin = true and public.is_buddy(s.caller_id, m.id)))
   order by public.is_buddy(s.caller_id, m.id) desc, s.play_at asc;
$function$;
GRANT EXECUTE ON FUNCTION public.eligible_sos_for_me() TO authenticated;

DROP FUNCTION IF EXISTS public.eligible_open_games_for_me();
CREATE FUNCTION public.eligible_open_games_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamptz, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamptz, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, court_type court_type_t, sport text, play_until timestamptz, ghost_name text, court_type_any boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (select id, level, home_city from public.profiles where id = auth.uid())
  select s.id, s.caller_id, s.play_at, s.court_id, s.format, s.level_min, s.level_max,
         s.court_status, s.note, s.status, s.claimed_by, s.created_at,
         c.name, c.city, c.area,
         case when p.is_admin = true and s.ghost_name is not null then s.ghost_name else p.name end,
         public.is_buddy(s.caller_id, m.id), s.court_type, s.sport, s.play_until,
         case when p.is_admin = true then s.ghost_name else null end,
         s.court_type_any
    from public.sos_requests s cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active' and s.kind = 'open'
     and coalesce(s.broadcast, true) = true
     and coalesce(s.play_until, s.play_at) > now()
     and s.caller_id <> m.id
     and ((m.home_city = c.city and m.level between s.level_min and s.level_max)
          or public.is_buddy(s.caller_id, m.id))
   order by public.is_buddy(s.caller_id, m.id) desc, s.play_at asc;
$function$;
GRANT EXECUTE ON FUNCTION public.eligible_open_games_for_me() TO authenticated;

DROP FUNCTION IF EXISTS public.public_board();
CREATE OR REPLACE FUNCTION public.public_board()
returns table(id uuid, kind text, play_at timestamptz, created_at timestamptz, format text, level_min int, level_max int, spots_needed int, spots_filled int, court_name text, court_city text, court_type text, court_status text, caller_id uuid, caller_name text, caller_photo text, play_until timestamptz, court_type_any boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind::text, s.play_at, s.created_at, s.format::text, s.level_min, s.level_max,
         s.spots_needed, s.spots_filled, c.name, c.city, s.court_type::text, s.court_status::text,
         p.id,
         case when p.is_admin = true and s.ghost_name is not null then s.ghost_name else p.name end,
         case when p.is_admin = true and s.ghost_name is not null then null else p.photo_url end,
         s.play_until, s.court_type_any
    from public.sos_requests s
    join public.courts c on c.id = s.court_id
    join public.profiles p on p.id = s.caller_id
   where s.status = 'active'
     and coalesce(s.broadcast, true) = true
     and coalesce(s.play_until, s.play_at) > now()
   order by s.play_at asc
   limit 50;
$$;
GRANT EXECUTE ON FUNCTION public.public_board() TO anon, authenticated;

DROP FUNCTION IF EXISTS public.swipe_deck();
CREATE FUNCTION public.swipe_deck()
RETURNS TABLE(
  id uuid, name text, photo_url text, photos text[], level int, home_city text, home_cities text[],
  bio text, fav_shot text, home_courts text, sports text[], vibe text, formats text[], play_times text[],
  looking_for text, experience text, goals text[], games_played int, rescues_count int, member_since timestamptz
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT home_city, home_cities FROM public.profiles WHERE id = auth.uid()),
  base AS (
    SELECT p.*, (
      p.home_city = (SELECT home_city FROM me)
      OR p.home_city = ANY (COALESCE((SELECT home_cities FROM me), ARRAY[]::text[]))
      OR (SELECT home_city FROM me) = ANY (COALESCE(p.home_cities, ARRAY[]::text[]))
    ) AS my_city
    FROM public.profiles p
    WHERE p.id <> auth.uid()
      AND NOT public.is_buddy(auth.uid(), p.id)
  ),
  sw AS (SELECT target_id, liked, created_at FROM public.swipes WHERE liker_id = auth.uid()),
  ranked AS (
    SELECT b.*, 1 AS tier, random() AS rnd FROM base b LEFT JOIN sw ON sw.target_id = b.id
     WHERE sw.target_id IS NULL AND b.my_city
    UNION ALL
    SELECT b.*, 2, random() FROM base b LEFT JOIN sw ON sw.target_id = b.id
     WHERE sw.target_id IS NULL AND NOT b.my_city
    UNION ALL
    SELECT b.*, 3, extract(epoch FROM sw.created_at) FROM base b JOIN sw ON sw.target_id = b.id
     WHERE sw.liked = false
  )
  SELECT id, name, photo_url, photos, level, home_city, home_cities,
         bio, fav_shot, home_courts, sports, vibe::text, formats, play_times,
         looking_for::text, experience, goals, games_played, rescues_count, created_at
  FROM ranked ORDER BY tier ASC, rnd ASC LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.swipe_deck() TO authenticated;

CREATE OR REPLACE FUNCTION public.public_players(_limit int DEFAULT 30)
returns table(id uuid, name text, photo_url text, level int, vibe text, home_city text, rescues_count int, games_played int)
language sql stable security definer set search_path = public as $$
  select id, name, photo_url, level, vibe::text, home_city, rescues_count, games_played
    from public.profiles
   where coalesce(name, '') <> ''
   order by (photo_url is not null) desc,
            (coalesce(bio, '') <> '') desc,
            games_played desc nulls last,
            created_at desc
   limit greatest(1, least(_limit, 50));
$$;
REVOKE ALL ON FUNCTION public.public_players(int) FROM public;
GRANT EXECUTE ON FUNCTION public.public_players(int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ▌PART 4/4 · public_game
CREATE OR REPLACE FUNCTION public.public_game(_id uuid)
RETURNS TABLE(
  id uuid, kind text, status text, play_at timestamptz, play_until timestamptz,
  format text, level_min int, level_max int,
  court_name text, court_city text, court_type text, court_type_any boolean, court_status text,
  spots_needed int, spots_filled int,
  host_name text, host_photo text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.kind::text, s.status::text, s.play_at, s.play_until,
         s.format::text, s.level_min, s.level_max,
         c.name, c.city, s.court_type::text, coalesce(s.court_type_any, false), s.court_status::text,
         s.spots_needed, s.spots_filled,
         CASE WHEN p.is_admin = true AND s.ghost_name IS NOT NULL THEN s.ghost_name ELSE p.name END,
         CASE WHEN p.is_admin = true AND s.ghost_name IS NOT NULL THEN NULL ELSE p.photo_url END
    FROM public.sos_requests s
    JOIN public.courts c ON c.id = s.court_id
    JOIN public.profiles p ON p.id = s.caller_id
   WHERE s.id = _id
     AND coalesce(s.broadcast, true) = true;
$$;
GRANT EXECUTE ON FUNCTION public.public_game(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
