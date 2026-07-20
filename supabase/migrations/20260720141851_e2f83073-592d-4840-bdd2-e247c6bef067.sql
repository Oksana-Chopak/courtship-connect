CREATE OR REPLACE FUNCTION public.claim_sos(_sos_id uuid)
RETURNS TABLE(ok boolean, reason text, sos_id uuid, game_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests; _game_id uuid; _new_filled int;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false,'not_authenticated'::text,_sos_id,NULL::uuid; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id=_sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'not_found'::text,_sos_id,NULL::uuid; RETURN; END IF;
  IF _sos.caller_id=_uid THEN RETURN QUERY SELECT false,'own_sos'::text,_sos_id,NULL::uuid; RETURN; END IF;
  IF _sos.status<>'active' THEN RETURN QUERY SELECT false,'taken'::text,_sos_id,NULL::uuid; RETURN; END IF;
  IF COALESCE(_sos.play_until, _sos.play_at) < now() THEN
    UPDATE public.sos_requests SET status='expired' WHERE id=_sos_id;
    RETURN QUERY SELECT false,'expired'::text,_sos_id,NULL::uuid; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.games g WHERE g.sos_id=_sos_id AND (g.player_a=_uid OR g.player_b=_uid)) THEN
    RETURN QUERY SELECT false,'already_in'::text,_sos_id,NULL::uuid; RETURN; END IF;
  INSERT INTO public.games (player_a,player_b,played_at,sos_id)
    VALUES (_sos.caller_id,_uid,_sos.play_at,_sos_id) RETURNING id INTO _game_id;
  _new_filled := COALESCE(_sos.spots_filled,0)+1;
  UPDATE public.sos_requests
     SET spots_filled=_new_filled, claimed_by=_uid,
         status=CASE WHEN _new_filled>=COALESCE(spots_needed,1) THEN 'claimed'::sos_status_t ELSE 'active'::sos_status_t END,
         play_until=CASE WHEN _new_filled>=COALESCE(spots_needed,1) THEN NULL ELSE play_until END
   WHERE id=_sos_id;
  UPDATE public.profiles SET rescues_count = rescues_count + 1 WHERE id = _uid;
  RETURN QUERY SELECT true,'ok'::text,_sos_id,_game_id;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_sos(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_admin    IS DISTINCT FROM OLD.is_admin    THEN NEW.is_admin    := OLD.is_admin;    END IF;
  IF NEW.signup_code IS DISTINCT FROM OLD.signup_code THEN NEW.signup_code := OLD.signup_code; END IF;
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.member_tier     := OLD.member_tier;
    NEW.member_since    := OLD.member_since;
    NEW.rescues_count   := OLD.rescues_count;
    NEW.games_played    := OLD.games_played;
    NEW.referrals_count := OLD.referrals_count;
    NEW.ghost_badge     := OLD.ghost_badge;
  END IF;
  RETURN NEW;
END $$;

DROP POLICY IF EXISTS "sos insert own" ON public.sos_requests;
CREATE POLICY "sos insert own" ON public.sos_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = caller_id
    AND (
      (ghost_name IS NULL AND ghost_claim_token IS NULL)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
    )
  );

DROP FUNCTION IF EXISTS public.cancel_game(uuid);
CREATE OR REPLACE FUNCTION public.cancel_game(_sos_id uuid)
RETURNS TABLE(claimer_ids uuid[], applicant_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ids uuid[]; _apps uuid[];
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
  RETURN QUERY SELECT _ids, _apps;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_game(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_my_game(_sos_id uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false,'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id=_sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'not_found'::text; RETURN; END IF;
  IF _sos.caller_id<>_uid THEN RETURN QUERY SELECT false,'not_owner'::text; RETURN; END IF;
  IF _sos.status<>'active' THEN RETURN QUERY SELECT false,'not_active'::text; RETURN; END IF;
  UPDATE public.sos_requests SET broadcast = true, invite_join_token = NULL WHERE id=_sos_id;
  RETURN QUERY SELECT true,'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.publish_my_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_my_game(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_game_by_token(_sos_id uuid, _token uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _name text; _sos public.sos_requests; _new_filled int;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  IF _sos.invite_join_token IS NULL OR _sos.invite_join_token <> _token THEN
    RETURN QUERY SELECT false, 'bad_token'::text; RETURN; END IF;
  IF _sos.caller_id = _uid THEN RETURN QUERY SELECT false, 'own'::text; RETURN; END IF;
  IF _sos.status <> 'active' THEN RETURN QUERY SELECT false, 'taken'::text; RETURN; END IF;
  IF COALESCE(_sos.play_until, _sos.play_at) < now() THEN
    RETURN QUERY SELECT false, 'expired'::text; RETURN; END IF;
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
    'You''re on. Tap to see the details.', '/sos/' || _sos_id::text, 'joined-' || _sos_id::text);
  RETURN QUERY SELECT true, 'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.join_game_by_token(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_game_by_token(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_ghost_game(_sos_id uuid, _token uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  IF _sos.ghost_claim_token IS NULL OR _sos.ghost_name IS NULL THEN
    RETURN QUERY SELECT false, 'not_ghost'::text; RETURN; END IF;
  IF _sos.ghost_claim_token <> _token THEN RETURN QUERY SELECT false, 'bad_token'::text; RETURN; END IF;
  IF _sos.caller_id = _uid THEN RETURN QUERY SELECT false, 'own'::text; RETURN; END IF;
  IF _sos.status <> 'active' THEN RETURN QUERY SELECT false, 'not_active'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.games g WHERE g.sos_id = _sos_id AND g.player_b = _uid) THEN
    RETURN QUERY SELECT false, 'already_in'::text; RETURN; END IF;
  UPDATE public.games SET player_a = _uid
   WHERE sos_id = _sos_id AND player_a = _sos.caller_id;
  UPDATE public.sos_requests
     SET caller_id = _uid, ghost_name = NULL, ghost_claim_token = NULL
   WHERE id = _sos_id;
  RETURN QUERY SELECT true, 'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.claim_ghost_game(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ghost_game(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.active_sos_count(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.sos_requests
   WHERE caller_id = _uid AND status = 'active' AND COALESCE(play_until, play_at) >= now();
$$;
GRANT EXECUTE ON FUNCTION public.active_sos_count(uuid) TO authenticated;

create or replace function public.edit_sos(
  _sos_id uuid, _play_at timestamptz, _court_id uuid, _format text,
  _level_min int, _level_max int, _court_status text, _note text,
  _court_type text, _duration_min int, _sport text default null, _play_until timestamptz default null
) returns table(ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _need int; _filled int;
begin
  if _uid is null then return query select false, 'not_authenticated'::text; return; end if;
  if _play_at is null or _play_at < now() then return query select false, 'time_gone'::text; return; end if;
  if _play_until is not null and _play_until <= _play_at then return query select false, 'bad_window'::text; return; end if;
  _need := case when _format = 'doubles_need2' then 2 when _format = 'doubles_need3' then 3 else 1 end;
  select coalesce(spots_filled,0) into _filled from public.sos_requests where id=_sos_id and caller_id=_uid;
  if _filled is not null and _need < _filled then _need := _filled; end if;
  update public.sos_requests
     set play_at=_play_at, court_id=_court_id, format=_format::sos_format_t,
         spots_needed=_need,
         level_min=greatest(1, least(5, coalesce(_level_min,1))),
         level_max=greatest(1, least(5, coalesce(_level_max,5))),
         court_status=_court_status::court_status_t,
         note=nullif(trim(coalesce(_note,'')),''),
         court_type=_court_type::court_type_t,
         duration_min=_duration_min,
         sport=case when _sport in ('tennis','padel','badminton') then _sport else sport end,
         play_until=_play_until,
         status=case when coalesce(spots_filled,0) >= _need then 'claimed'::sos_status_t else 'active'::sos_status_t end
   where id=_sos_id and caller_id=_uid and status='active';
  if not found then return query select false, 'not_found_or_not_editable'::text; return; end if;
  return query select true, 'ok'::text;
end $$;
GRANT EXECUTE ON FUNCTION public.edit_sos(uuid,timestamptz,uuid,text,int,int,text,text,text,int,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_noshow(_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _g public.games; _other uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _uid = _g.player_a THEN _other := _g.player_b;
  ELSIF _uid = _g.player_b THEN _other := _g.player_a;
  ELSE RAISE EXCEPTION 'not_participant';
  END IF;
  UPDATE public.games SET reported_noshow = _other WHERE id = _game_id;
  UPDATE public.profiles SET ghost_badge = true WHERE id = _other;
  IF _g.sos_id IS NOT NULL AND _other = _g.player_b THEN
    UPDATE public.profiles SET rescues_count = GREATEST(0, rescues_count - 1) WHERE id = _other;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.report_noshow(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';