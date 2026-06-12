
-- A. Games: per-user archive + creation time + read policy update
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS archived_by uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- B. Trust loop: report_noshow takes back rescue credit if reported player was the SOS claimer
CREATE OR REPLACE FUNCTION public.report_noshow(_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _g public.games; _other uuid; _sos public.sos_requests;
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
  -- Take back rescue credit if the no-show player was the SOS claimer
  IF _g.sos_id IS NOT NULL THEN
    SELECT * INTO _sos FROM public.sos_requests WHERE id = _g.sos_id;
    IF FOUND AND _sos.claimed_by = _other THEN
      UPDATE public.profiles
         SET rescues_count = GREATEST(0, rescues_count - 1)
       WHERE id = _other;
    END IF;
  END IF;
END;
$function$;

-- C. Archive a game's confirmation card for me (silent, no penalty)
CREATE OR REPLACE FUNCTION public.archive_game(_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _g public.games;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _uid <> _g.player_a AND _uid <> _g.player_b THEN RAISE EXCEPTION 'not_participant'; END IF;
  IF _uid <> ALL(_g.archived_by) THEN
    UPDATE public.games SET archived_by = array_append(archived_by, _uid) WHERE id = _game_id;
  END IF;
END;
$function$;

-- D. Withdraw my claim. Returns whether we re-flared the SOS.
CREATE OR REPLACE FUNCTION public.withdraw_claim(_sos_id uuid)
 RETURNS TABLE(ok boolean, re_flared boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sos public.sos_requests;
  _refire boolean := false;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, false, 'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, false, 'not_found'::text; RETURN; END IF;
  IF _sos.claimed_by <> _uid THEN RETURN QUERY SELECT false, false, 'not_claimant'::text; RETURN; END IF;
  IF _sos.play_at <= now() THEN RETURN QUERY SELECT false, false, 'already_played'::text; RETURN; END IF;

  -- Delete the unconfirmed game row(s) for this pair on this SOS
  DELETE FROM public.games
   WHERE sos_id = _sos_id
     AND ((player_a = _sos.caller_id AND player_b = _uid) OR (player_a = _uid AND player_b = _sos.caller_id))
     AND confirmed_a = false AND confirmed_b = false;

  -- Take back rescue credit
  UPDATE public.profiles SET rescues_count = GREATEST(0, rescues_count - 1) WHERE id = _uid;

  -- Reopen the request, decide whether to re-flare based on urgency window (6h)
  IF _sos.play_at <= now() + interval '6 hours' THEN
    _refire := true;
    UPDATE public.sos_requests
       SET status = 'active', claimed_by = NULL, kind = 'sos', flared_at = now()
     WHERE id = _sos_id;
  ELSE
    UPDATE public.sos_requests
       SET status = 'active', claimed_by = NULL
     WHERE id = _sos_id;
  END IF;

  RETURN QUERY SELECT true, _refire, 'ok'::text;
END;
$function$;

-- E. Community stats: all-time counts CONFIRMED games only
CREATE OR REPLACE FUNCTION public.community_stats(_city text)
 RETURNS TABLE(sets_saved integer, games_matched integer, new_buddies integer, all_time_games integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bounds as (
    select date_trunc('week', now()) as wstart
  ),
  city_sos as (
    select s.* from public.sos_requests s
    join public.courts c on c.id = s.court_id
    where c.city = _city
  ),
  city_games as (
    select g.* from public.games g
    join public.sos_requests s on s.id = g.sos_id
    join public.courts c on c.id = s.court_id
    where c.city = _city
  ),
  city_buddies as (
    select b.* from public.buddies b
    join public.profiles p1 on p1.id = b.user_low
    join public.profiles p2 on p2.id = b.user_high
    where p1.home_city = _city or p2.home_city = _city
  )
  select
    (select count(*)::int from city_sos, bounds
       where status='claimed' and kind='sos' and created_at >= wstart),
    (select count(*)::int from city_sos, bounds
       where status='claimed' and kind='open' and created_at >= wstart),
    (select count(*)::int from city_buddies, bounds where created_at >= wstart),
    (select count(*)::int from city_games where confirmed_a and confirmed_b);
$function$;

-- F. Admin dashboard: returns a JSON blob the admin page renders
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
  city_list AS (SELECT unnest(ARRAY['Uppsala','Stockholm']) AS city)
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

-- G. Admin: create invite code (shared or personal-with-owner)
CREATE OR REPLACE FUNCTION public.admin_create_invite_code(_code text, _owner_id uuid, _uses int)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.invite_codes (code, uses_remaining, active, owner_id)
  VALUES (upper(_code), GREATEST(1, COALESCE(_uses, 1)), true, _owner_id);
END;
$function$;
