
-- Atomic claim
CREATE OR REPLACE FUNCTION public.claim_sos(_sos_id uuid)
RETURNS TABLE(ok boolean, reason text, sos_id uuid, game_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _sos public.sos_requests;
  _game_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN QUERY SELECT false, 'not_authenticated'::text, _sos_id, NULL::uuid; RETURN;
  END IF;

  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, _sos_id, NULL::uuid; RETURN;
  END IF;

  IF _sos.caller_id = _uid THEN
    RETURN QUERY SELECT false, 'own_sos'::text, _sos_id, NULL::uuid; RETURN;
  END IF;

  IF _sos.status <> 'active' THEN
    RETURN QUERY SELECT false, 'taken'::text, _sos_id, NULL::uuid; RETURN;
  END IF;

  IF _sos.play_at < now() THEN
    UPDATE public.sos_requests SET status = 'expired' WHERE id = _sos_id;
    RETURN QUERY SELECT false, 'expired'::text, _sos_id, NULL::uuid; RETURN;
  END IF;

  UPDATE public.sos_requests
     SET status = 'claimed', claimed_by = _uid
   WHERE id = _sos_id;

  INSERT INTO public.games (player_a, player_b, played_at, sos_id)
  VALUES (_sos.caller_id, _uid, _sos.play_at, _sos_id)
  RETURNING id INTO _game_id;

  UPDATE public.profiles SET rescues_count = rescues_count + 1 WHERE id = _uid;

  RETURN QUERY SELECT true, 'ok'::text, _sos_id, _game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_sos(uuid) TO authenticated;

-- Count active SOS for a caller
CREATE OR REPLACE FUNCTION public.active_sos_count(_uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.sos_requests
   WHERE caller_id = _uid AND status = 'active' AND play_at >= now();
$$;
GRANT EXECUTE ON FUNCTION public.active_sos_count(uuid) TO authenticated;

-- Sweep expired
CREATE OR REPLACE FUNCTION public.expire_old_sos()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sos_requests SET status = 'expired'
   WHERE status = 'active' AND play_at < now();
$$;
GRANT EXECUTE ON FUNCTION public.expire_old_sos() TO authenticated;

-- Count rescuers matching a SOS (level inside range, buddy_optin != no, not caller)
CREATE OR REPLACE FUNCTION public.count_matching_rescuers(_sos_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
    FROM public.profiles p
    JOIN public.sos_requests s ON s.id = _sos_id
   WHERE p.id <> s.caller_id
     AND p.buddy_optin <> 'no'
     AND p.level BETWEEN s.level_min AND s.level_max;
$$;
GRANT EXECUTE ON FUNCTION public.count_matching_rescuers(uuid) TO authenticated;

-- Realtime
ALTER TABLE public.sos_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_requests;
