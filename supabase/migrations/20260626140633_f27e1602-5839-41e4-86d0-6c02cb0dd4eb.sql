create or replace function public.top_active_month()
returns table(user_id uuid, name text, n int)
language sql security definer set search_path = public as $$
  select x.pl as user_id, p.name, count(*)::int as n
  from (
    select player_a as pl from public.games
      where played_at >= date_trunc('month', now()) and played_at < date_trunc('month', now()) + interval '1 month'
    union all
    select player_b as pl from public.games
      where played_at >= date_trunc('month', now()) and played_at < date_trunc('month', now()) + interval '1 month'
  ) x
  join public.profiles p on p.id = x.pl
  group by x.pl, p.name
  order by n desc, p.name
  limit 5;
$$;
revoke all on function public.top_active_month() from public, anon;
grant execute on function public.top_active_month() to authenticated;

create or replace function public.top_hosts_month()
returns table(user_id uuid, name text, n int)
language sql security definer set search_path = public as $$
  select sr.caller_id as user_id, p.name, count(*)::int as n
  from public.sos_requests sr
  join public.profiles p on p.id = sr.caller_id
  where sr.kind = 'open'
    and sr.play_at >= date_trunc('month', now())
    and sr.play_at < date_trunc('month', now()) + interval '1 month'
  group by sr.caller_id, p.name
  order by n desc, p.name
  limit 5;
$$;
revoke all on function public.top_hosts_month() from public, anon;
grant execute on function public.top_hosts_month() to authenticated;

create table if not exists public.kudos (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_id, to_id)
);
grant select on public.kudos to authenticated;
grant all on public.kudos to service_role;
alter table public.kudos enable row level security;
drop policy if exists "kudos readable" on public.kudos;
create policy "kudos readable" on public.kudos for select to authenticated using (true);
create index if not exists idx_kudos_to on public.kudos (to_id);

create or replace function public.give_kudos(_to uuid)
returns int language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _n int;
begin
  if _uid is null then raise exception 'not_authenticated'; end if;
  if _uid = _to then raise exception 'self'; end if;
  insert into public.kudos (from_id, to_id) values (_uid, _to) on conflict (from_id, to_id) do nothing;
  select count(*)::int into _n from public.kudos where to_id = _to;
  return _n;
end $$;
revoke all on function public.give_kudos(uuid) from public, anon;
grant execute on function public.give_kudos(uuid) to authenticated;

create or replace function public.kudos_for(_ids uuid[])
returns table(to_id uuid, n int, mine boolean)
language sql stable security definer set search_path = public as $$
  select k.to_id, count(*)::int as n, bool_or(k.from_id = auth.uid()) as mine
  from public.kudos k
  where k.to_id = any(_ids)
  group by k.to_id;
$$;
revoke all on function public.kudos_for(uuid[]) from public, anon;
grant execute on function public.kudos_for(uuid[]) to authenticated;

notify pgrst, 'reload schema';