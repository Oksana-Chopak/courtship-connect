-- Mystery Match: Tinder-style swipe. Mutual like = a match (+ auto-buddy).
CREATE TABLE IF NOT EXISTS public.swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liked boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (liker_id, target_id)
);
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.swipes TO authenticated;
GRANT ALL ON public.swipes TO service_role;
CREATE POLICY "own swipes readable" ON public.swipes
  FOR SELECT TO authenticated USING (auth.uid() = liker_id);
CREATE INDEX IF NOT EXISTS idx_swipes_liker ON public.swipes (liker_id);
CREATE INDEX IF NOT EXISTS idx_swipes_target_liked ON public.swipes (target_id, liked);

-- Record a swipe; on mutual like, auto-buddy and report the match.
CREATE OR REPLACE FUNCTION public.do_swipe(_target uuid, _like boolean)
RETURNS TABLE(is_match boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _match boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _uid = _target THEN RAISE EXCEPTION 'self'; END IF;
  INSERT INTO public.swipes (liker_id, target_id, liked)
  VALUES (_uid, _target, _like)
  ON CONFLICT (liker_id, target_id) DO UPDATE SET liked = EXCLUDED.liked, created_at = now();
  IF _like THEN
    SELECT EXISTS (
      SELECT 1 FROM public.swipes s
       WHERE s.liker_id = _target AND s.target_id = _uid AND s.liked = true
    ) INTO _match;
    IF _match THEN
      PERFORM public._add_buddy(_uid, _target, 'manual');
    END IF;
  END IF;
  RETURN QUERY SELECT _match;
END $$;
GRANT EXECUTE ON FUNCTION public.do_swipe(uuid, boolean) TO authenticated;

-- Candidate deck: players in my city I haven't swiped yet.
CREATE OR REPLACE FUNCTION public.swipe_deck()
RETURNS TABLE(id uuid, name text, photo_url text, level int, home_city text, bio text, fav_shot text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT home_city, home_cities FROM public.profiles WHERE id = auth.uid())
  SELECT p.id, p.name, p.photo_url, p.level, p.home_city, p.bio, p.fav_shot
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
  ORDER BY random()
  LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.swipe_deck() TO authenticated;
