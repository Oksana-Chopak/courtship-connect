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
  values (auth.uid(), _other_id, coalesce(_played_at, now()), null, nullif(trim(_score), ''), _winner, _court_id, true, true)
  returning id into _id;
  return _id;
end $$;

revoke all on function public.log_game(uuid, timestamptz, text, uuid, uuid) from public, anon;
grant execute on function public.log_game(uuid, timestamptz, text, uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.bump_games_played()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.confirmed_a AND NEW.confirmed_b
     AND NOT (COALESCE(OLD.confirmed_a, false) AND COALESCE(OLD.confirmed_b, false)) THEN
    UPDATE public.profiles SET games_played = games_played + 1 WHERE id = NEW.player_a;
    IF NEW.player_b IS NOT NULL AND NEW.player_b <> NEW.player_a THEN
      UPDATE public.profiles SET games_played = games_played + 1 WHERE id = NEW.player_b;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bump_games_played_trg ON public.games;
CREATE TRIGGER bump_games_played_trg AFTER INSERT OR UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.bump_games_played();

notify pgrst, 'reload schema';