
DO $$ BEGIN
  CREATE TYPE public.court_type_t AS ENUM ('indoor','outdoor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.sos_requests
  ADD COLUMN IF NOT EXISTS court_type public.court_type_t NOT NULL DEFAULT 'outdoor';

DROP FUNCTION IF EXISTS public.eligible_sos_for_me();
DROP FUNCTION IF EXISTS public.eligible_open_games_for_me();

CREATE FUNCTION public.eligible_sos_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamp with time zone, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamp with time zone, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, court_type court_type_t)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (
    select id, level, buddy_optin, home_city, buddy_sos_optin
      from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area, p.name,
         public.is_buddy(s.caller_id, m.id),
         s.court_type
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
$function$;

CREATE FUNCTION public.eligible_open_games_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamp with time zone, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamp with time zone, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, court_type court_type_t)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (
    select id, level, home_city from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area, p.name,
         public.is_buddy(s.caller_id, m.id),
         s.court_type
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
$function$;
