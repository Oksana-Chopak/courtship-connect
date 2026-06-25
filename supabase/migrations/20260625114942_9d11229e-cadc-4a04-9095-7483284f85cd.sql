create or replace function public.log_game(_other_id uuid, _played_at timestamptz, _score text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare _id uuid;
begin
  if _other_id is null or _other_id = auth.uid() then
    raise exception 'pick another player';
  end if;
  if not exists (select 1 from public.profiles where id = _other_id) then
    raise exception 'unknown player';
  end if;
  insert into public.games (player_a, player_b, played_at, sos_id, score, confirmed_a, confirmed_b)
  values (auth.uid(), _other_id, coalesce(_played_at, now()), null, nullif(trim(_score), ''), true, false)
  returning id into _id;
  return _id;
end $$;

revoke all on function public.log_game(uuid, timestamptz, text) from public, anon;
grant execute on function public.log_game(uuid, timestamptz, text) to authenticated;