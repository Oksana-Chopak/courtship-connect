CREATE OR REPLACE FUNCTION public.escalate_due_open_games()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n int; _r record;
BEGIN
  WITH upd AS (
    UPDATE public.sos_requests
       SET kind = 'sos', flared_at = now()
     WHERE status = 'active'
       AND kind = 'open'
       AND auto_flare = true
       AND play_until IS NULL
       AND play_at > now()
       AND play_at <= now() + interval '7 hours'
     RETURNING id
  )
  SELECT count(*) INTO _n FROM upd;
  FOR _r IN
    SELECT s.id, s.caller_id
      FROM public.sos_requests s
     WHERE s.status = 'active'
       AND s.kind = 'sos'
       AND s.flared_at IS NOT NULL
       AND s.cancel_nudged_at IS NULL
       AND COALESCE(s.spots_filled, 0) < COALESCE(s.spots_needed, 1)
       AND s.play_at > now()
       AND s.play_at <= now() + interval '6 hours'
  LOOP
    UPDATE public.sos_requests SET cancel_nudged_at = now() WHERE id = _r.id;
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

notify pgrst, 'reload schema';