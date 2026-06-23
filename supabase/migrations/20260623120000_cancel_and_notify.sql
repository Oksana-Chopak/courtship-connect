-- Iteration 1.5 — cancel a claimed game + direct notifications.

-- A. Host can cancel a game at ANY status (not just 'active'); returns the
-- joiners so the client can push them "host cancelled". Drops the unconfirmed
-- future game rows so they leave everyone's "upcoming".
CREATE OR REPLACE FUNCTION public.cancel_game(_sos_id uuid)
RETURNS TABLE(claimer_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ids uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sos_requests WHERE id = _sos_id AND caller_id = _uid) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT g.player_b), '{}')
    INTO _ids
    FROM public.games g
   WHERE g.sos_id = _sos_id AND g.player_b <> _uid;
  UPDATE public.sos_requests SET status = 'cancelled' WHERE id = _sos_id AND caller_id = _uid;
  DELETE FROM public.games
   WHERE sos_id = _sos_id AND confirmed_a = false AND confirmed_b = false;
  RETURN QUERY SELECT _ids;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_game(uuid) TO authenticated;

-- B. Weekly SOS cap should count only SOS broadcasts, so direct notifications
-- (cancellations, match invites) don't eat into it. Re-define with kind filter.
CREATE OR REPLACE FUNCTION public.sos_push_targets(_sos_id uuid)
RETURNS TABLE(user_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT sr.caller_id, sr.status, sr.level_min, sr.level_max, c.city AS court_city
    FROM public.sos_requests sr
    LEFT JOIN public.courts c ON c.id = sr.court_id
    WHERE sr.id = _sos_id
  ),
  n AS (SELECT EXTRACT(hour FROM (now() AT TIME ZONE 'Europe/Stockholm'))::int AS hr)
  SELECT ps.user_id, ps.endpoint, ps.p256dh, ps.auth
  FROM s
  JOIN public.profiles p ON p.id <> s.caller_id
  JOIN public.push_subscriptions ps ON ps.user_id = p.id
  CROSS JOIN n
  WHERE s.status = 'active'
    AND p.buddy_sos_optin = true
    AND p.level BETWEEN s.level_min AND s.level_max
    AND (
      p.home_city = s.court_city
      OR s.court_city = ANY (COALESCE(p.home_cities, ARRAY[]::text[]))
    )
    AND (p.push_wake_me OR (n.hr >= 7 AND n.hr < 22))
    AND (
      SELECT count(*) FROM public.push_events pe
      WHERE pe.user_id = p.id AND pe.kind = 'sos' AND pe.sent_at > now() - interval '7 days'
    ) < p.push_max_per_week;
$$;
REVOKE ALL ON FUNCTION public.sos_push_targets(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.sos_push_targets(uuid) TO service_role;
