alter table public.profiles
  add column if not exists member_tier text check (member_tier in ('member','founding','pro')),
  add column if not exists member_since timestamptz;

DROP FUNCTION IF EXISTS public.players_directory(uuid[]);

CREATE OR REPLACE FUNCTION public.players_directory(_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id uuid, name text, last_name text, photo_url text, level int,
  formats text[], play_times text[], vibe vibe_t, looking_for looking_for_t,
  home_courts text, home_city text, home_cities text[], buddy_optin buddy_optin_t,
  buddy_radius_km int, rescues_count int, ghost_badge boolean,
  bio text, fav_shot text, games_played int, created_at timestamptz,
  member_tier text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, last_name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, bio, fav_shot, games_played, created_at,
         member_tier
    FROM public.profiles
   WHERE (_ids IS NULL OR id = ANY(_ids));
$$;
REVOKE ALL ON FUNCTION public.players_directory(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.players_directory(uuid[]) TO authenticated;

create or replace function public.admin_set_member(_user uuid, _tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;
  if _tier is not null and _tier not in ('member','founding','pro') then
    raise exception 'bad tier';
  end if;
  update public.profiles
     set member_tier = _tier,
         member_since = case when _tier is null then null else coalesce(member_since, now()) end
   where id = _user;
end $$;
revoke all on function public.admin_set_member(uuid, text) from public, anon;
grant execute on function public.admin_set_member(uuid, text) to authenticated;

create or replace function public.get_member_config()
returns table(key text, value text)
language sql stable security definer set search_path = public as $$
  select key, value from public.app_config
   where key in ('stripe_member_monthly','stripe_member_yearly','stripe_pro_monthly');
$$;
revoke all on function public.get_member_config() from public, anon;
grant execute on function public.get_member_config() to authenticated;

create or replace function public.set_member_config(_key text, _value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;
  if _key not in ('stripe_member_monthly','stripe_member_yearly','stripe_pro_monthly') then
    raise exception 'bad key';
  end if;
  if coalesce(trim(_value), '') = '' then
    delete from public.app_config where key = _key;
  else
    insert into public.app_config (key, value) values (_key, trim(_value))
      on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;
revoke all on function public.set_member_config(text, text) from public, anon;
grant execute on function public.set_member_config(text, text) to authenticated;

create or replace function public.founders_wall()
returns table(id uuid, name text, last_name text, photo_url text, member_tier text, member_since timestamptz)
language sql stable security definer set search_path = public as $$
  select id, name, last_name, photo_url, member_tier, member_since
    from public.profiles
   where member_tier is not null
   order by member_since asc nulls last
   limit 100;
$$;
revoke all on function public.founders_wall() from public, anon;
grant execute on function public.founders_wall() to authenticated;

notify pgrst, 'reload schema';