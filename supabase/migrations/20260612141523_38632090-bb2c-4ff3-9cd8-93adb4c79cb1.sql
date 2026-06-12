
-- 1. Add new columns
ALTER TABLE public.sos_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'sos',
  ADD COLUMN IF NOT EXISTS auto_flare boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS flared_at timestamptz;

-- Constrain kind values via trigger (CHECK is fine here, immutable)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sos_requests_kind_chk'
  ) THEN
    ALTER TABLE public.sos_requests
      ADD CONSTRAINT sos_requests_kind_chk CHECK (kind IN ('sos','open'));
  END IF;
END $$;

-- 2. Rewrite eligible_sos_for_me to only return kind='sos'
CREATE OR REPLACE FUNCTION public.eligible_sos_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamp with time zone, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamp with time zone, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  with me as (
    select id, level, buddy_optin, home_city, buddy_sos_optin
      from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area, p.name,
         public.is_buddy(s.caller_id, m.id)
    from public.sos_requests s
    cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active' and s.kind = 'sos'
     and s.play_at > now()
     and s.caller_id <> m.id
     and (
       (m.buddy_optin <> 'no'
         and m.home_city = c.city
         and m.level between s.level_min and s.level_max)
       or (m.buddy_sos_optin = true
            and public.is_buddy(s.caller_id, m.id))
     )
   order by public.is_buddy(s.caller_id, m.id) desc, s.play_at asc;
$$;

-- 3. Eligible open games (city or buddy)
CREATE OR REPLACE FUNCTION public.eligible_open_games_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamp with time zone, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamp with time zone, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  with me as (
    select id, level, home_city from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area, p.name,
         public.is_buddy(s.caller_id, m.id)
    from public.sos_requests s
    cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active' and s.kind = 'open'
     and s.play_at > now()
     and s.caller_id <> m.id
     and (
       (m.home_city = c.city
         and m.level between s.level_min and s.level_max)
       or public.is_buddy(s.caller_id, m.id)
     )
   order by public.is_buddy(s.caller_id, m.id) desc, s.play_at asc;
$$;

-- 4. Escalate due open games -> sos
CREATE OR REPLACE FUNCTION public.escalate_due_open_games()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n int;
BEGIN
  WITH upd AS (
    UPDATE public.sos_requests
       SET kind = 'sos', flared_at = now()
     WHERE status = 'active'
       AND kind = 'open'
       AND auto_flare = true
       AND play_at > now()
       AND play_at <= now() + interval '6 hours'
     RETURNING id
  )
  SELECT count(*) INTO _n FROM upd;
  RETURN _n;
END; $$;

-- 5. Community stats
CREATE OR REPLACE FUNCTION public.community_stats(_city text)
 RETURNS TABLE(sets_saved int, games_matched int, new_buddies int, all_time_games int)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    (select count(*)::int from city_games);
$$;

-- 6. Schedule escalation + expiry every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('escalate-open-games');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'escalate-open-games',
  '*/5 * * * *',
  $cron$
    SELECT public.escalate_due_open_games();
    SELECT public.expire_old_sos();
  $cron$
);
