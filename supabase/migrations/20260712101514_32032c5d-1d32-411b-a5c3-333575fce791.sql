
-- PART 1 · edit_sos with _play_until
drop function if exists public.edit_sos(uuid, timestamptz, uuid, text, int, int, text, text, text, int, text);
drop function if exists public.edit_sos(uuid, timestamptz, uuid, text, int, int, text, text, text, int);
create or replace function public.edit_sos(
  _sos_id uuid, _play_at timestamptz, _court_id uuid, _format text,
  _level_min int, _level_max int, _court_status text, _note text,
  _court_type text, _duration_min int, _sport text default null, _play_until timestamptz default null
) returns table(ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then return query select false, 'not_authenticated'::text; return; end if;
  if _play_at is null or _play_at < now() then return query select false, 'time_gone'::text; return; end if;
  if _play_until is not null and _play_until <= _play_at then return query select false, 'bad_window'::text; return; end if;
  update public.sos_requests
     set play_at=_play_at, court_id=_court_id, format=_format::sos_format_t,
         level_min=greatest(1, least(5, coalesce(_level_min,1))),
         level_max=greatest(1, least(5, coalesce(_level_max,5))),
         court_status=_court_status::court_status_t,
         note=nullif(trim(coalesce(_note,'')),''),
         court_type=_court_type::court_type_t,
         duration_min=_duration_min,
         sport=case when _sport in ('tennis','padel','badminton') then _sport else sport end,
         play_until=_play_until
   where id=_sos_id and caller_id=_uid and status='active';
  if not found then return query select false, 'not_found_or_not_editable'::text; return; end if;
  return query select true, 'ok'::text;
end $$;
revoke all on function public.edit_sos(uuid, timestamptz, uuid, text, int, int, text, text, text, int, text, timestamptz) from public, anon;
grant execute on function public.edit_sos(uuid, timestamptz, uuid, text, int, int, text, text, text, int, text, timestamptz) to authenticated;

-- PART 2 · flare skips windows
CREATE OR REPLACE FUNCTION public.escalate_due_open_games()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n int; _r record;
BEGIN
  WITH upd AS (
    UPDATE public.sos_requests SET kind='sos', flared_at=now()
     WHERE status='active' AND kind='open' AND auto_flare=true
       AND play_until IS NULL
       AND play_at > now() AND play_at <= now() + interval '7 hours'
     RETURNING id
  ) SELECT count(*) INTO _n FROM upd;
  FOR _r IN
    SELECT s.id, s.caller_id FROM public.sos_requests s
     WHERE s.status='active' AND s.kind='sos' AND s.flared_at IS NOT NULL
       AND s.cancel_nudged_at IS NULL
       AND COALESCE(s.spots_filled,0) < COALESCE(s.spots_needed,1)
       AND s.play_at > now() AND s.play_at <= now() + interval '6 hours'
  LOOP
    UPDATE public.sos_requests SET cancel_nudged_at=now() WHERE id=_r.id;
    PERFORM public._push_users(
      ARRAY[_r.caller_id],
      '⏰ Still no takers',
      'Nobody grabbed your game yet. Court cancellation is usually free until 6h before — cancel now penalty-free, or keep the SOS live 🎾',
      '/sos/' || _r.id::text,
      'cancel-window-' || _r.id::text
    );
  END LOOP;
  RETURN _n;
END; $$;

CREATE OR REPLACE FUNCTION public.withdraw_claim(_sos_id uuid)
RETURNS TABLE(ok boolean, re_flared boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests; _refire boolean:=false; _had_game boolean;
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
  RETURN QUERY SELECT true,_refire,'ok'::text;
END; $$;
GRANT EXECUTE ON FUNCTION public.withdraw_claim(uuid) TO authenticated;

-- PART 3 · confirm_game with winner
DROP FUNCTION IF EXISTS public.confirm_game(uuid);
DROP FUNCTION IF EXISTS public.confirm_game(uuid, text);
CREATE OR REPLACE FUNCTION public.confirm_game(_game_id uuid, _score text DEFAULT NULL, _winner uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _g public.games;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _uid = _g.player_a THEN
    UPDATE public.games SET confirmed_a = true WHERE id = _game_id;
  ELSIF _uid = _g.player_b THEN
    UPDATE public.games SET confirmed_b = true WHERE id = _game_id;
  ELSE
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF _score IS NOT NULL AND length(trim(_score)) > 0 THEN
    UPDATE public.games SET score = left(trim(_score), 40) WHERE id = _game_id;
  END IF;
  IF _winner IS NOT NULL THEN
    IF _winner <> _g.player_a AND _winner <> _g.player_b THEN RAISE EXCEPTION 'bad_winner'; END IF;
    UPDATE public.games SET winner = _winner WHERE id = _game_id;
  END IF;
  IF (SELECT confirmed_a AND confirmed_b FROM public.games WHERE id = _game_id) THEN
    UPDATE public.profiles SET ghost_badge = false WHERE id IN (_g.player_a, _g.player_b);
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.confirm_game(uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
