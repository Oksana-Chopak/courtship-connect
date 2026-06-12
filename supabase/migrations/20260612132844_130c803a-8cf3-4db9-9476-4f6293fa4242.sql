
-- A. COURTS + CITIES -------------------------------------------------------
alter table public.courts add column if not exists city text not null default 'Uppsala';

update public.sos_requests set court_id = null;
delete from public.courts;
insert into public.courts (name, area, city) values
  ('UTK-hallen (Upsala TK)',           'Gränby sportfält',  'Uppsala'),
  ('USIF Tennisarena',                  'Rosendal',          'Uppsala'),
  ('CityPadel · Läkarlabbet court',     'Boländerna',        'Uppsala'),
  ('Kungl. Tennishallen (KLTK)',        'Gärdet',            'Stockholm'),
  ('SALK-hallen',                       'Alvik',             'Stockholm'),
  ('Tennisstadion',                     'Norra Djurgården',  'Stockholm'),
  ('Janne Lundqvist Tennishall',        'Kristineberg',      'Stockholm'),
  ('Hellas Tennis',                     'Nacka',             'Stockholm'),
  ('Enskede Rackethall',                'Enskede',           'Stockholm'),
  ('Rålambshovsparken (free courts)',   'Kungsholmen',       'Stockholm');

-- B. PROFILES + INVITE CODES ----------------------------------------------
alter table public.profiles
  add column if not exists home_city text not null default 'Uppsala',
  add column if not exists buddy_sos_optin boolean not null default true,
  add column if not exists signup_code text;

alter table public.invite_codes
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Refresh profiles_public view to include home_city
drop view if exists public.profiles_public;
create view public.profiles_public with (security_invoker = true) as
  select id, name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, created_at
    from public.profiles;
grant select on public.profiles_public to authenticated;

-- C. BUDDIES TABLE ---------------------------------------------------------
create table public.buddies (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('played','invite','manual')),
  created_at timestamptz not null default now(),
  unique (user_low, user_high),
  check (user_low < user_high)
);
grant select, delete on public.buddies to authenticated;
grant all on public.buddies to service_role;
alter table public.buddies enable row level security;
create policy "buddies read mine" on public.buddies for select to authenticated
  using (auth.uid() = user_low or auth.uid() = user_high);
create policy "buddies delete mine" on public.buddies for delete to authenticated
  using (auth.uid() = user_low or auth.uid() = user_high);

create table public.buddy_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);
grant select on public.buddy_requests to authenticated;
grant all on public.buddy_requests to service_role;
alter table public.buddy_requests enable row level security;
create policy "br read mine" on public.buddy_requests for select to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id);

-- D. FUNCTIONS --------------------------------------------------------------
create or replace function public.is_buddy(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.buddies
     where user_low = least(_a,_b) and user_high = greatest(_a,_b)
  );
$$;

create or replace function public._add_buddy(_a uuid, _b uuid, _source text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _a is null or _b is null or _a = _b then return; end if;
  insert into public.buddies (user_low, user_high, source)
  values (least(_a,_b), greatest(_a,_b), _source)
  on conflict (user_low, user_high) do nothing;
end; $$;

create or replace function public.request_buddy(_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid();
begin
  if _me is null then raise exception 'not_authenticated'; end if;
  if _me = _other then raise exception 'cannot_buddy_self'; end if;
  if public.is_buddy(_me, _other) then return; end if;
  insert into public.buddy_requests (from_id, to_id) values (_me, _other)
  on conflict (from_id, to_id) do update set status = 'pending', created_at = now();
end; $$;

create or replace function public.respond_buddy_request(_req_id uuid, _accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _r public.buddy_requests;
begin
  select * into _r from public.buddy_requests where id = _req_id for update;
  if not found or _r.to_id <> _me then raise exception 'not_found'; end if;
  if _accept then
    perform public._add_buddy(_r.from_id, _r.to_id, 'manual');
    update public.buddy_requests set status = 'accepted' where id = _req_id;
  else
    update public.buddy_requests set status = 'declined' where id = _req_id;
  end if;
end; $$;

create or replace function public.remove_buddy(_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid();
begin
  if _me is null then raise exception 'not_authenticated'; end if;
  delete from public.buddies
   where user_low = least(_me,_other) and user_high = greatest(_me,_other);
  delete from public.buddy_requests
   where (from_id = _me and to_id = _other) or (from_id = _other and to_id = _me);
end; $$;

-- Auto-buddy when a game is fully confirmed
create or replace function public._buddy_on_played() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.confirmed_a and NEW.confirmed_b
     and not (coalesce(OLD.confirmed_a,false) and coalesce(OLD.confirmed_b,false)) then
    perform public._add_buddy(NEW.player_a, NEW.player_b, 'played');
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_buddy_on_played on public.games;
create trigger trg_buddy_on_played
  after update on public.games
  for each row execute function public._buddy_on_played();

-- Auto-buddy when a profile is created with an invite code that has an owner
create or replace function public._buddy_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare _owner uuid;
begin
  if NEW.signup_code is null then return NEW; end if;
  select owner_id into _owner from public.invite_codes
   where code = upper(NEW.signup_code);
  if _owner is not null and _owner <> NEW.id then
    perform public._add_buddy(_owner, NEW.id, 'invite');
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_buddy_on_signup on public.profiles;
create trigger trg_buddy_on_signup
  after insert on public.profiles
  for each row execute function public._buddy_on_signup();

-- E. UPDATED RESCUER COUNT (union of nearby + buddy rules) ----------------
create or replace function public.count_matching_rescuers(_sos_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  with s as (
    select sr.caller_id, sr.level_min, sr.level_max, c.city as court_city
      from public.sos_requests sr
      left join public.courts c on c.id = sr.court_id
     where sr.id = _sos_id
  )
  select count(*)::int from public.profiles p, s
   where p.id <> s.caller_id
     and (
       (p.home_city = s.court_city
         and p.level between s.level_min and s.level_max
         and p.buddy_optin <> 'no')
       or (
         p.buddy_sos_optin = true
         and exists (
           select 1 from public.buddies b
            where b.user_low = least(p.id, s.caller_id)
              and b.user_high = greatest(p.id, s.caller_id)
         )
       )
     );
$$;

-- F. ELIGIBLE SOS FOR THE CURRENT USER -------------------------------------
create or replace function public.eligible_sos_for_me()
returns table (
  id uuid,
  caller_id uuid,
  play_at timestamptz,
  court_id uuid,
  format public.sos_format_t,
  level_min int,
  level_max int,
  court_status public.court_status_t,
  note text,
  status public.sos_status_t,
  claimed_by uuid,
  created_at timestamptz,
  court_name text,
  court_city text,
  court_area text,
  caller_name text,
  is_buddy boolean
) language sql stable security definer set search_path = public as $$
  with me as (
    select id, level, buddy_optin, home_city, buddy_sos_optin
      from public.profiles where id = auth.uid()
  )
  select s.id, s.caller_id, s.play_at, s.court_id, s.format,
         s.level_min, s.level_max, s.court_status, s.note, s.status,
         s.claimed_by, s.created_at,
         c.name, c.city, c.area,
         p.name,
         public.is_buddy(s.caller_id, m.id)
    from public.sos_requests s
    cross join me m
    left join public.courts c on c.id = s.court_id
    left join public.profiles p on p.id = s.caller_id
   where s.status = 'active'
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

-- Realtime for buddy tables
alter publication supabase_realtime add table public.buddies;
alter publication supabase_realtime add table public.buddy_requests;
