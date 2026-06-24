-- Lucky Serve 🎰 — a random eligible player in your city (any level/prefs).
CREATE OR REPLACE FUNCTION public.random_player_for_me()
RETURNS TABLE(id uuid, name text, photo_url text, level int, home_city text, bio text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT home_city, home_cities FROM public.profiles WHERE id = auth.uid())
  SELECT p.id, p.name, p.photo_url, p.level, p.home_city, p.bio
  FROM public.profiles p, me
  WHERE p.id <> auth.uid()
    AND (
      p.home_city = me.home_city
      OR p.home_city = ANY (COALESCE(me.home_cities, ARRAY[]::text[]))
      OR me.home_city = ANY (COALESCE(p.home_cities, ARRAY[]::text[]))
    )
  ORDER BY random()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.random_player_for_me() TO authenticated;
