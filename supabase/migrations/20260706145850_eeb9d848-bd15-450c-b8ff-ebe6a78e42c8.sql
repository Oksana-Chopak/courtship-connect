
alter table public.profiles
  add column if not exists sports text[] not null default '{tennis}',
  add column if not exists goals text[],
  add column if not exists experience text;

alter table public.event_requests
  add column if not exists sport text not null default 'tennis';

do $$ begin
  alter table public.event_requests
    add constraint event_sport_check check (sport in ('tennis','padel','badminton'));
exception when duplicate_object then null; end $$;

DROP FUNCTION IF EXISTS public.eligible_sos_for_me();
CREATE FUNCTION public.eligible_sos_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamp with time zone, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamp with time zone, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, court_type court_type_t, sport text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (
    select id, level, buddy_optin, home_city, buddy_sos_optin, sports
      from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area, p.name,
         public.is_buddy(s.caller_id, m.id),
         s.court_type,
         s.sport
    from public.sos_requests s
    cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active' and s.kind = 'sos'
     and s.play_at > now()
     and s.caller_id <> m.id
     and s.sport = any(coalesce(m.sports, '{tennis}'))
     and (
       (m.buddy_optin <> 'no'
         and m.home_city = c.city
         and m.level between s.level_min and s.level_max)
       or (m.buddy_sos_optin = true
            and public.is_buddy(s.caller_id, m.id))
     )
   order by public.is_buddy(s.caller_id, m.id) desc, s.play_at asc;
$function$;
GRANT EXECUTE ON FUNCTION public.eligible_sos_for_me() TO authenticated;

DROP FUNCTION IF EXISTS public.eligible_open_games_for_me();
CREATE FUNCTION public.eligible_open_games_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamp with time zone, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamp with time zone, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, court_type court_type_t, sport text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (
    select id, level, home_city, sports from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area, p.name,
         public.is_buddy(s.caller_id, m.id),
         s.court_type,
         s.sport
    from public.sos_requests s
    cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active' and s.kind = 'open'
     and s.play_at > now()
     and s.caller_id <> m.id
     and s.sport = any(coalesce(m.sports, '{tennis}'))
     and (
       (m.home_city = c.city
         and m.level between s.level_min and s.level_max)
       or public.is_buddy(s.caller_id, m.id)
     )
   order by public.is_buddy(s.caller_id, m.id) desc, s.play_at asc;
$function$;
GRANT EXECUTE ON FUNCTION public.eligible_open_games_for_me() TO authenticated;

DROP FUNCTION IF EXISTS public.players_directory(uuid[]);
CREATE OR REPLACE FUNCTION public.players_directory(_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id uuid, name text, last_name text, photo_url text, level int,
  formats text[], play_times text[], vibe vibe_t, looking_for looking_for_t,
  home_courts text, home_city text, home_cities text[], buddy_optin buddy_optin_t,
  buddy_radius_km int, rescues_count int, ghost_badge boolean,
  bio text, fav_shot text, games_played int, created_at timestamptz,
  member_tier text, sports text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, last_name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, bio, fav_shot, games_played, created_at,
         member_tier, coalesce(sports, '{tennis}')
    FROM public.profiles
   WHERE (_ids IS NULL OR id = ANY(_ids));
$$;
REVOKE ALL ON FUNCTION public.players_directory(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.players_directory(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.sos_push_targets(_sos_id uuid)
RETURNS TABLE(user_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT sr.caller_id, sr.status, sr.level_min, sr.level_max, sr.sport, c.city AS court_city
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
    AND s.sport = ANY (COALESCE(p.sports, '{tennis}'))
    AND p.level BETWEEN s.level_min AND s.level_max
    AND (p.home_city = s.court_city OR s.court_city = ANY (COALESCE(p.home_cities, ARRAY[]::text[])))
    AND (p.push_wake_me OR (n.hr >= 7 AND n.hr < 22))
    AND (SELECT count(*) FROM public.push_events pe WHERE pe.user_id = p.id AND pe.kind = 'sos' AND pe.sent_at > now() - interval '7 days') < p.push_max_per_week;
$$;
REVOKE ALL ON FUNCTION public.sos_push_targets(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.sos_push_targets(uuid) TO service_role;

notify pgrst, 'reload schema';
