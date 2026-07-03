alter table public.games
  add column if not exists court_id uuid references public.courts(id);

drop function if exists public.log_game(uuid, timestamptz, text, uuid);

create or replace function public.log_game(
  _other_id uuid,
  _played_at timestamptz,
  _score text default null,
  _winner uuid default null,
  _court_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if _other_id is null or _other_id = auth.uid() then raise exception 'pick another player'; end if;
  if not exists (select 1 from public.profiles where id = _other_id) then raise exception 'unknown player'; end if;
  if _winner is not null and _winner <> auth.uid() and _winner <> _other_id then raise exception 'bad winner'; end if;
  if _court_id is not null and not exists (select 1 from public.courts where id = _court_id) then raise exception 'unknown court'; end if;
  insert into public.games (player_a, player_b, played_at, sos_id, score, winner, court_id, confirmed_a, confirmed_b)
  values (auth.uid(), _other_id, coalesce(_played_at, now()), null, nullif(trim(_score), ''), _winner, _court_id, true, false)
  returning id into _id;
  return _id;
end $$;

revoke all on function public.log_game(uuid, timestamptz, text, uuid, uuid) from public, anon;
grant execute on function public.log_game(uuid, timestamptz, text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';