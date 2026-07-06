create or replace function public.public_board()
returns table(
  id uuid, kind text, play_at timestamptz, created_at timestamptz,
  format text, level_min int, level_max int,
  spots_needed int, spots_filled int,
  court_name text, court_city text, court_type text, court_status text,
  caller_id uuid, caller_name text, caller_photo text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind::text, s.play_at, s.created_at,
         s.format::text, s.level_min, s.level_max,
         s.spots_needed, s.spots_filled,
         c.name, c.city, s.court_type::text, s.court_status::text,
         p.id, p.name, p.photo_url
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

create or replace function public.public_players(_limit int default 30)
returns table(
  id uuid, name text, photo_url text, level int, vibe text,
  home_city text, rescues_count int, games_played int
)
language sql stable security definer set search_path = public as $$
  select id, name, photo_url, level, vibe::text,
         home_city, rescues_count, games_played
    from public.profiles
   where coalesce(name, '') <> ''
   order by created_at desc
   limit greatest(1, least(_limit, 50));
$$;
revoke all on function public.public_players(int) from public;
grant execute on function public.public_players(int) to anon, authenticated;

do $$
begin
  begin execute 'grant execute on function public.top_active_month() to anon';
  exception when undefined_function then null; end;
  begin execute 'grant execute on function public.top_rescuers_month() to anon';
  exception when undefined_function then null; end;
  begin execute 'grant execute on function public.top_hosts_month() to anon';
  exception when undefined_function then null; end;
end $$;

drop policy if exists events_public_peek on public.event_requests;
create policy events_public_peek on public.event_requests
  for select to anon
  using (status = 'approved' and starts_at > now());

notify pgrst, 'reload schema';