DROP FUNCTION IF EXISTS public.swipe_deck();
CREATE FUNCTION public.swipe_deck()
RETURNS TABLE(
  id uuid, name text, photo_url text, photos text[],
  level int, home_city text, home_cities text[],
  bio text, fav_shot text, home_courts text,
  sports text[], vibe text, formats text[], play_times text[],
  looking_for text, experience text, goals text[],
  games_played int, rescues_count int, member_since timestamptz
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT home_city, home_cities FROM public.profiles WHERE id = auth.uid())
  SELECT p.id, p.name, p.photo_url, p.photos,
         p.level, p.home_city, p.home_cities,
         p.bio, p.fav_shot, p.home_courts,
         p.sports, p.vibe::text, p.formats, p.play_times,
         p.looking_for::text, p.experience, p.goals,
         p.games_played, p.rescues_count, p.created_at
  FROM public.profiles p, me
  WHERE p.id <> auth.uid()
    AND (
      p.home_city = me.home_city
      OR p.home_city = ANY (COALESCE(me.home_cities, ARRAY[]::text[]))
      OR me.home_city = ANY (COALESCE(p.home_cities, ARRAY[]::text[]))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes s WHERE s.liker_id = auth.uid() AND s.target_id = p.id
    )
    AND NOT public.is_buddy(auth.uid(), p.id)
  ORDER BY random()
  LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.swipe_deck() TO authenticated;

DROP FUNCTION IF EXISTS public.random_player_for_me();
CREATE FUNCTION public.random_player_for_me()
RETURNS TABLE(
  id uuid, name text, photo_url text, photos text[],
  level int, home_city text, home_cities text[],
  bio text, fav_shot text, home_courts text,
  sports text[], vibe text, formats text[], play_times text[],
  looking_for text, experience text, goals text[],
  games_played int, rescues_count int, member_since timestamptz
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT home_city, home_cities FROM public.profiles WHERE id = auth.uid())
  SELECT p.id, p.name, p.photo_url, p.photos,
         p.level, p.home_city, p.home_cities,
         p.bio, p.fav_shot, p.home_courts,
         p.sports, p.vibe::text, p.formats, p.play_times,
         p.looking_for::text, p.experience, p.goals,
         p.games_played, p.rescues_count, p.created_at
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

notify pgrst, 'reload schema';