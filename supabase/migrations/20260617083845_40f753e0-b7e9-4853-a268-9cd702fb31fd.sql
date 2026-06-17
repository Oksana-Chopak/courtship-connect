ALTER TYPE public.sos_format_t ADD VALUE IF NOT EXISTS 'doubles_need3';

ALTER TABLE public.sos_requests
  ADD COLUMN IF NOT EXISTS spots_needed int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS spots_filled int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.set_spots_needed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.spots_needed := CASE NEW.format::text
    WHEN 'doubles_need3' THEN 3 WHEN 'doubles_need2' THEN 2 ELSE 1 END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_spots_needed ON public.sos_requests;
CREATE TRIGGER trg_set_spots_needed
  BEFORE INSERT ON public.sos_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_spots_needed();

UPDATE public.sos_requests
  SET spots_needed = CASE WHEN format::text = 'doubles_need2' THEN 2 ELSE 1 END;
UPDATE public.sos_requests
  SET spots_filled = spots_needed WHERE status = 'claimed';

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
  IF _sos.play_at<now() THEN
    UPDATE public.sos_requests SET status='expired' WHERE id=_sos_id;
    RETURN QUERY SELECT false,'expired'::text,_sos_id,NULL::uuid; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.games g WHERE g.sos_id=_sos_id AND (g.player_a=_uid OR g.player_b=_uid)) THEN
    RETURN QUERY SELECT false,'already_in'::text,_sos_id,NULL::uuid; RETURN; END IF;
  INSERT INTO public.games (player_a,player_b,played_at,sos_id)
    VALUES (_sos.caller_id,_uid,_sos.play_at,_sos_id) RETURNING id INTO _game_id;
  _new_filled := COALESCE(_sos.spots_filled,0)+1;
  UPDATE public.sos_requests
     SET spots_filled=_new_filled, claimed_by=_uid,
         status=CASE WHEN _new_filled>=COALESCE(spots_needed,1) THEN 'claimed'::sos_status_t ELSE 'active'::sos_status_t END
   WHERE id=_sos_id;
  UPDATE public.profiles SET rescues_count=rescues_count+1 WHERE id=_uid;
  RETURN QUERY SELECT true,'ok'::text,_sos_id,_game_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.claim_sos(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_claim(_sos_id uuid)
RETURNS TABLE(ok boolean, re_flared boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests; _refire boolean:=false; _had_game boolean;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false,false,'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id=_sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false,false,'not_found'::text; RETURN; END IF;
  IF _sos.play_at<=now() THEN RETURN QUERY SELECT false,false,'already_played'::text; RETURN; END IF;
  SELECT EXISTS(SELECT 1 FROM public.games WHERE sos_id=_sos_id
     AND ((player_a=_sos.caller_id AND player_b=_uid) OR (player_a=_uid AND player_b=_sos.caller_id))
     AND confirmed_a=false AND confirmed_b=false) INTO _had_game;
  IF NOT _had_game THEN RETURN QUERY SELECT false,false,'not_claimant'::text; RETURN; END IF;
  DELETE FROM public.games WHERE sos_id=_sos_id
     AND ((player_a=_sos.caller_id AND player_b=_uid) OR (player_a=_uid AND player_b=_sos.caller_id))
     AND confirmed_a=false AND confirmed_b=false;
  UPDATE public.profiles SET rescues_count=GREATEST(0,rescues_count-1) WHERE id=_uid;
  IF _sos.play_at<=now()+interval '6 hours' THEN
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