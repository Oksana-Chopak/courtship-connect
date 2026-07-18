
ALTER TABLE public.sos_requests ADD COLUMN IF NOT EXISTS ghost_name text NULL;
ALTER TABLE public.sos_requests ADD COLUMN IF NOT EXISTS ghost_claim_token uuid NULL;

CREATE OR REPLACE FUNCTION public.claim_ghost_game(_sos_id uuid, _token uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  IF _sos.ghost_claim_token IS NULL OR _sos.ghost_name IS NULL THEN
    RETURN QUERY SELECT false, 'not_ghost'::text; RETURN;
  END IF;
  IF _sos.ghost_claim_token <> _token THEN RETURN QUERY SELECT false, 'bad_token'::text; RETURN; END IF;
  IF _sos.caller_id = _uid THEN RETURN QUERY SELECT false, 'own'::text; RETURN; END IF;
  UPDATE public.games SET player_a = _uid
   WHERE sos_id = _sos_id AND player_a = _sos.caller_id;
  UPDATE public.sos_requests
     SET caller_id = _uid, ghost_name = NULL, ghost_claim_token = NULL
   WHERE id = _sos_id;
  RETURN QUERY SELECT true, 'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.claim_ghost_game(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ghost_game(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.eligible_sos_for_me();
CREATE FUNCTION public.eligible_sos_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamptz, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamptz, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, court_type court_type_t, sport text, play_until timestamptz, ghost_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (
    select id, level, buddy_optin, home_city, buddy_sos_optin
      from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area,
         case when p.is_admin = true and s.ghost_name is not null then s.ghost_name else p.name end,
         public.is_buddy(s.caller_id, m.id),
         s.court_type,
         s.sport,
         s.play_until,
         case when p.is_admin = true then s.ghost_name else null end
    from public.sos_requests s
    cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active' and s.kind = 'sos'
     and coalesce(s.play_until, s.play_at) > now()
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
GRANT EXECUTE ON FUNCTION public.eligible_sos_for_me() TO authenticated;

DROP FUNCTION IF EXISTS public.eligible_open_games_for_me();
CREATE FUNCTION public.eligible_open_games_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamptz, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamptz, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, court_type court_type_t, sport text, play_until timestamptz, ghost_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (
    select id, level, home_city from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area,
         case when p.is_admin = true and s.ghost_name is not null then s.ghost_name else p.name end,
         public.is_buddy(s.caller_id, m.id),
         s.court_type,
         s.sport,
         s.play_until,
         case when p.is_admin = true then s.ghost_name else null end
    from public.sos_requests s
    cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active' and s.kind = 'open'
     and coalesce(s.play_until, s.play_at) > now()
     and s.caller_id <> m.id
     and (
       (m.home_city = c.city
         and m.level between s.level_min and s.level_max)
       or public.is_buddy(s.caller_id, m.id)
     )
   order by public.is_buddy(s.caller_id, m.id) desc, s.play_at asc;
$function$;
GRANT EXECUTE ON FUNCTION public.eligible_open_games_for_me() TO authenticated;

DROP FUNCTION IF EXISTS public.public_board();
CREATE OR REPLACE FUNCTION public.public_board()
returns table(
  id uuid, kind text, play_at timestamptz, created_at timestamptz,
  format text, level_min int, level_max int,
  spots_needed int, spots_filled int,
  court_name text, court_city text, court_type text, court_status text,
  caller_id uuid, caller_name text, caller_photo text,
  play_until timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind::text, s.play_at, s.created_at,
         s.format::text, s.level_min, s.level_max,
         s.spots_needed, s.spots_filled,
         c.name, c.city, s.court_type::text, s.court_status::text,
         p.id,
         case when p.is_admin = true and s.ghost_name is not null then s.ghost_name else p.name end,
         case when p.is_admin = true and s.ghost_name is not null then null else p.photo_url end,
         s.play_until
    from public.sos_requests s
    join public.courts c on c.id = s.court_id
    join public.profiles p on p.id = s.caller_id
   where s.status = 'active'
     and coalesce(s.play_until, s.play_at) > now()
   order by s.play_at asc
   limit 50;
$$;
GRANT EXECUTE ON FUNCTION public.public_board() TO anon, authenticated;

notify pgrst, 'reload schema';
