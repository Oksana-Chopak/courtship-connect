alter table public.games add column if not exists winner uuid;

drop function if exists public.log_game(uuid, timestamptz, text);

create or replace function public.log_game(_other_id uuid, _played_at timestamptz, _score text default null, _winner uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if _other_id is null or _other_id = auth.uid() then raise exception 'pick another player'; end if;
  if not exists (select 1 from public.profiles where id = _other_id) then raise exception 'unknown player'; end if;
  if _winner is not null and _winner <> auth.uid() and _winner <> _other_id then raise exception 'bad winner'; end if;
  insert into public.games (player_a, player_b, played_at, sos_id, score, winner, confirmed_a, confirmed_b)
  values (auth.uid(), _other_id, coalesce(_played_at, now()), null, nullif(trim(_score), ''), _winner, true, false)
  returning id into _id;
  return _id;
end $$;
revoke all on function public.log_game(uuid, timestamptz, text, uuid) from public, anon;
grant execute on function public.log_game(uuid, timestamptz, text, uuid) to authenticated;

drop function if exists public.confirm_game(uuid, text);

create or replace function public.confirm_game(_game_id uuid, _score text default null, _winner uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _g public.games;
begin
  if _uid is null then raise exception 'not_authenticated'; end if;
  select * into _g from public.games where id = _game_id for update;
  if not found then raise exception 'not_found'; end if;
  if _uid = _g.player_a then update public.games set confirmed_a = true where id = _game_id;
  elsif _uid = _g.player_b then update public.games set confirmed_b = true where id = _game_id;
  else raise exception 'not_participant'; end if;
  if _score is not null and length(trim(_score)) > 0 then
    update public.games set score = left(trim(_score), 40) where id = _game_id;
  end if;
  if _winner is not null and (_winner = _g.player_a or _winner = _g.player_b) then
    update public.games set winner = _winner where id = _game_id;
  end if;
  if (select confirmed_a and confirmed_b from public.games where id = _game_id) then
    update public.profiles set ghost_badge = false where id in (_g.player_a, _g.player_b);
  end if;
end; $$;
grant execute on function public.confirm_game(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';