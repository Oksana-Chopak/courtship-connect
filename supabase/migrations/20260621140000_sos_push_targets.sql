-- Iteration 1 — who gets pinged for an SOS. All targeting policy lives here in
-- the DB (single source of truth) so the edge function stays a thin sender.
-- Returns one row per device subscription to notify.
--
-- Rules: opt-in on, not the caller, level within the SOS range, same city as the
-- court (geo radius arrives in Iteration 2 — buddy_radius_km is collected now),
-- quiet hours 22:00–06:59 Europe/Stockholm unless the user enabled "wake me",
-- and the user is under their weekly alert cap.
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
    AND (p.push_wake_me OR (n.hr >= 7 AND n.hr < 22))   -- quiet hours unless wake-me
    AND (
      SELECT count(*) FROM public.push_events pe
      WHERE pe.user_id = p.id AND pe.sent_at > now() - interval '7 days'
    ) < p.push_max_per_week;
$$;

-- Only the edge function (service role) targets pushes; clients never call this.
REVOKE ALL ON FUNCTION public.sos_push_targets(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.sos_push_targets(uuid) TO service_role;
