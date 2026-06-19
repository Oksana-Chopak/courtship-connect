ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fav_shot text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS games_played int NOT NULL DEFAULT 0;
GRANT SELECT (bio, fav_shot, games_played) ON public.profiles TO authenticated;

DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public WITH (security_invoker = true) AS
  SELECT id, name, last_name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, bio, fav_shot, games_played, created_at
    FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;

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
CREATE TRIGGER bump_games_played_trg AFTER UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.bump_games_played();

UPDATE public.profiles p SET games_played = COALESCE(sub.cnt, 0) FROM (
  SELECT uid, COUNT(*)::int AS cnt FROM (
    SELECT player_a AS uid FROM public.games WHERE confirmed_a AND confirmed_b
    UNION ALL
    SELECT player_b AS uid FROM public.games WHERE confirmed_a AND confirmed_b AND player_b IS NOT NULL
  ) g GROUP BY uid
) sub WHERE p.id = sub.uid;