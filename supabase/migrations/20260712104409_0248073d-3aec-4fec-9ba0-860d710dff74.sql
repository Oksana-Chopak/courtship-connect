CREATE OR REPLACE FUNCTION public.do_swipe(_target uuid, _like boolean)
RETURNS TABLE(is_match boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _match boolean := false; _my_name text;
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
      SELECT name INTO _my_name FROM public.profiles WHERE id = _uid;
      PERFORM public._push_users(
        ARRAY[_target],
        '💘 It''s a match. Literally.',
        coalesce(_my_name, 'Someone') || ' would play you too — you''re buddies now. Plan a game! 🎾',
        '/players/' || _uid::text,
        'crush-' || _uid::text
      );
    END IF;
  END IF;
  RETURN QUERY SELECT _match;
END $$;
GRANT EXECUTE ON FUNCTION public.do_swipe(uuid, boolean) TO authenticated;

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
    AND NOT public.is_buddy(auth.uid(), p.id)
  ORDER BY random()
  LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.swipe_deck() TO authenticated;

notify pgrst, 'reload schema';