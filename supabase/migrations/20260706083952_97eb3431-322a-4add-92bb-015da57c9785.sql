-- 1) sport column
alter table public.sos_requests
  add column if not exists sport text not null default 'tennis';

do $$ begin
  alter table public.sos_requests
    add constraint sos_sport_check check (sport in ('tennis','padel','badminton'));
exception when duplicate_object then null; end $$;

-- 2a) eligible_sos_for_me + sport
DROP FUNCTION IF EXISTS public.eligible_sos_for_me();
CREATE OR REPLACE FUNCTION public.eligible_sos_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamp with time zone, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamp with time zone, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, sport text)
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
         public.is_buddy(s.caller_id, m.id),
         s.sport
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
GRANT EXECUTE ON FUNCTION public.eligible_sos_for_me() TO authenticated;

-- 2b) eligible_open_games_for_me + sport
DROP FUNCTION IF EXISTS public.eligible_open_games_for_me();
CREATE OR REPLACE FUNCTION public.eligible_open_games_for_me()
 RETURNS TABLE(id uuid, caller_id uuid, play_at timestamp with time zone, court_id uuid, format sos_format_t, level_min integer, level_max integer, court_status court_status_t, note text, status sos_status_t, claimed_by uuid, created_at timestamp with time zone, court_name text, court_city text, court_area text, caller_name text, is_buddy boolean, sport text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  with me as (
    select id, level, home_city from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area, p.name,
         public.is_buddy(s.caller_id, m.id),
         s.sport
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
GRANT EXECUTE ON FUNCTION public.eligible_open_games_for_me() TO authenticated;

-- 2c) public_board + sport (guest peek)
DROP FUNCTION IF EXISTS public.public_board();
create or replace function public.public_board()
returns table(
  id uuid, kind text, play_at timestamptz, created_at timestamptz,
  format text, level_min int, level_max int,
  spots_needed int, spots_filled int,
  court_name text, court_city text, court_type text, court_status text,
  caller_id uuid, caller_name text, caller_photo text, sport text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind::text, s.play_at, s.created_at,
         s.format::text, s.level_min, s.level_max,
         s.spots_needed, s.spots_filled,
         c.name, c.city, s.court_type::text, s.court_status::text,
         p.id, p.name, p.photo_url, s.sport
    from public.sos_requests s
    join public.courts c on c.id = s.court_id
    join public.profiles p on p.id = s.caller_id
   where s.status = 'active'
     and s.play_at > now()
   order by s.play_at asc
   limit 50;
$$;
revoke all on function public.public_board() from public;
grant execute on function public.public_board() to anon, authenticated;

-- 3) Miami public tennis centres
insert into public.courts (name, area, city)
select v.name, v.area, 'Miami' from (values
  ('Crandon Park Tennis Center', 'Key Biscayne'),
  ('Flamingo Park Tennis Center', 'South Beach'),
  ('Moore Park Tennis Center', 'Midtown'),
  ('Tropical Park Tennis Center', 'Westchester')
) as v(name, area)
where not exists (select 1 from public.courts c where c.name = v.name);

-- 4) Referral reward: 10 invited friends → Founding Member for a year
alter table public.profiles
  add column if not exists member_until timestamptz;

create or replace function public.grant_founding_on_referrals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(old.referrals_count, 0) < 10
     and coalesce(new.referrals_count, 0) >= 10
     and new.member_tier is null then
    update public.profiles
       set member_tier = 'founding',
           member_since = coalesce(member_since, now()),
           member_until = now() + interval '1 year'
     where id = new.id;
    perform public._push_users(
      array[new.id],
      '🏆 Founding Member unlocked!',
      '10 friends joined through you — that''s a free year of Founding. Legend.',
      '/me',
      'founding-referral-' || new.id::text
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_grant_founding_on_referrals on public.profiles;
create trigger trg_grant_founding_on_referrals
  after update of referrals_count on public.profiles
  for each row execute function public.grant_founding_on_referrals();

notify pgrst, 'reload schema';