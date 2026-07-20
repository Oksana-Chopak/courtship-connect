CREATE TABLE IF NOT EXISTS public.cities (
  name            text PRIMARY KEY,
  country         text NOT NULL DEFAULT '',
  timezone        text NOT NULL DEFAULT 'Europe/Stockholm',
  granularity_min int  NOT NULL DEFAULT 60,
  active          boolean NOT NULL DEFAULT true,
  sort            int  NOT NULL DEFAULT 100
);

INSERT INTO public.cities (name, country, timezone, granularity_min, sort) VALUES
  ('Uppsala',   'Sweden', 'Europe/Stockholm', 60, 1),
  ('Stockholm', 'Sweden', 'Europe/Stockholm', 30, 2),
  ('Miami',     'USA',    'America/New_York',  30, 3)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cities TO authenticated, anon;

DROP POLICY IF EXISTS "cities readable" ON public.cities;
CREATE POLICY "cities readable"
  ON public.cities FOR SELECT TO authenticated, anon
  USING (active);

INSERT INTO public.courts (name, area, city)
SELECT v.name, v.area, v.city
FROM (VALUES
  ('Crandon Park Tennis Center',   'Key Biscayne', 'Miami'),
  ('Salvadore Park Tennis Center', 'Coral Gables', 'Miami'),
  ('Flamingo Park Tennis Center',  'Miami Beach',  'Miami'),
  ('Moore Park Tennis Center',     'Allapattah',   'Miami')
) AS v(name, area, city)
WHERE NOT EXISTS (
  SELECT 1 FROM public.courts c WHERE c.name = v.name AND c.city = v.city
);

DROP POLICY IF EXISTS "courts insert by authenticated" ON public.courts;
CREATE POLICY "courts insert by authenticated"
  ON public.courts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND is_custom = true
    AND hidden = false
    AND length(trim(name)) BETWEEN 2 AND 80
    AND EXISTS (SELECT 1 FROM public.cities c WHERE c.name = city AND c.active)
  );

CREATE OR REPLACE FUNCTION public.sos_push_targets(_sos_id uuid)
RETURNS TABLE(user_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT sr.caller_id, sr.status, sr.level_min, sr.level_max, sr.sport, c.city AS court_city
    FROM public.sos_requests sr
    LEFT JOIN public.courts c ON c.id = sr.court_id
    WHERE sr.id = _sos_id
  ),
  tz AS (
    SELECT COALESCE(
      (SELECT ci.timezone FROM public.cities ci JOIN s ON ci.name = s.court_city),
      'Europe/Stockholm'
    ) AS zone
  ),
  n AS (SELECT EXTRACT(hour FROM (now() AT TIME ZONE (SELECT zone FROM tz)))::int AS hr)
  SELECT ps.user_id, ps.endpoint, ps.p256dh, ps.auth
  FROM s
  JOIN public.profiles p ON p.id <> s.caller_id
  JOIN public.push_subscriptions ps ON ps.user_id = p.id
  CROSS JOIN n
  WHERE s.status = 'active'
    AND p.buddy_sos_optin = true
    AND s.sport = ANY (COALESCE(p.sports, '{tennis}'))
    AND p.level BETWEEN s.level_min AND s.level_max
    AND (p.home_city = s.court_city OR s.court_city = ANY (COALESCE(p.home_cities, ARRAY[]::text[])))
    AND (p.push_wake_me OR (n.hr >= 7 AND n.hr < 22))
    AND (SELECT count(*) FROM public.push_events pe WHERE pe.user_id = p.id AND pe.kind = 'sos' AND pe.sent_at > now() - interval '7 days') < p.push_max_per_week;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _res jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH wstart AS (SELECT date_trunc('week', now()) AS w),
  city_list AS (SELECT name AS city FROM public.cities WHERE active ORDER BY sort)
  SELECT jsonb_build_object(
    'profiles_total', (SELECT COUNT(*) FROM public.profiles),
    'profiles_new_week', (SELECT COUNT(*) FROM public.profiles, wstart WHERE created_at >= w),
    'rescuer_optin_pct', (
      SELECT CASE WHEN COUNT(*) = 0 THEN 0
                  ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE buddy_optin <> 'no') / COUNT(*))::int END
        FROM public.profiles
    ),
    'buddy_pairs', (SELECT COUNT(*) FROM public.buddies),
    'ghost_count', (SELECT COUNT(*) FROM public.profiles WHERE ghost_badge),
    'fill_rate_pct', (
      SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE status='claimed')
                       / NULLIF(COUNT(*) FILTER (WHERE status <> 'cancelled'), 0))::int, 0)
        FROM public.sos_requests
    ),
    'by_city', (
      SELECT jsonb_object_agg(cl.city, jsonb_build_object(
        'sos_created_week', (
          SELECT COUNT(*) FROM public.sos_requests s
            JOIN public.courts c ON c.id = s.court_id, wstart
           WHERE c.city = cl.city AND s.kind='sos' AND s.created_at >= w
        ),
        'sos_claimed_week', (
          SELECT COUNT(*) FROM public.sos_requests s
            JOIN public.courts c ON c.id = s.court_id, wstart
           WHERE c.city = cl.city AND s.kind='sos' AND s.status='claimed' AND s.created_at >= w
        ),
        'open_posted_week', (
          SELECT COUNT(*) FROM public.sos_requests s
            JOIN public.courts c ON c.id = s.court_id, wstart
           WHERE c.city = cl.city AND s.kind='open' AND s.created_at >= w
        ),
        'open_filled_pct', (
          SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE s.status='claimed')
                          / NULLIF(COUNT(*) FILTER (WHERE s.status <> 'cancelled'), 0))::int, 0)
            FROM public.sos_requests s JOIN public.courts c ON c.id = s.court_id
           WHERE c.city = cl.city AND s.kind='open'
        ),
        'fill_rate_pct', (
          SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE s.status='claimed')
                          / NULLIF(COUNT(*) FILTER (WHERE s.status <> 'cancelled'), 0))::int, 0)
            FROM public.sos_requests s JOIN public.courts c ON c.id = s.court_id
           WHERE c.city = cl.city
        ),
        'median_ttc_min', (
          SELECT COALESCE(
            ROUND(EXTRACT(EPOCH FROM percentile_cont(0.5) WITHIN GROUP (
              ORDER BY g.created_at - s.created_at
            )) / 60)::int, 0)
            FROM public.sos_requests s
            JOIN public.courts c ON c.id = s.court_id
            JOIN public.games g ON g.sos_id = s.id
           WHERE c.city = cl.city AND s.kind='sos' AND s.status='claimed'
        ),
        'all_time_games_confirmed', (
          SELECT COUNT(*) FROM public.games g
            JOIN public.sos_requests s ON s.id = g.sos_id
            JOIN public.courts c ON c.id = s.court_id
           WHERE c.city = cl.city AND g.confirmed_a AND g.confirmed_b
        )
      )) FROM city_list cl
    )
  ) INTO _res;
  RETURN _res;
END;
$function$;

NOTIFY pgrst, 'reload schema';