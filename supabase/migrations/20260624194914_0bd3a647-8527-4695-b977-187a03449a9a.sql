-- ===== 20260621120000_perf_indexes.sql =====
CREATE INDEX IF NOT EXISTS idx_sos_status_kind_playat ON public.sos_requests (status, kind, play_at);
CREATE INDEX IF NOT EXISTS idx_sos_caller ON public.sos_requests (caller_id);
CREATE INDEX IF NOT EXISTS idx_sos_claimed_by ON public.sos_requests (claimed_by);
CREATE INDEX IF NOT EXISTS idx_games_player_a_playedat ON public.games (player_a, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_player_b_playedat ON public.games (player_b, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_sos ON public.games (sos_id);

-- ===== 20260621130000_push_infra.sql =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_max_per_week int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS push_wake_me boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  ua text,
  fail_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
DROP POLICY IF EXISTS "own subscriptions readable" ON public.push_subscriptions;
CREATE POLICY "own subscriptions readable" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS public.push_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sos_id uuid REFERENCES public.sos_requests(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'sos',
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.push_events TO authenticated;
GRANT ALL ON public.push_events TO service_role;
DROP POLICY IF EXISTS "own push events readable" ON public.push_events;
CREATE POLICY "own push events readable" ON public.push_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_push_events_user_sent ON public.push_events (user_id, sent_at);

CREATE OR REPLACE FUNCTION public.save_push_subscription(_endpoint text, _p256dh text, _auth text, _ua text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _endpoint IS NULL OR _p256dh IS NULL OR _auth IS NULL THEN RAISE EXCEPTION 'bad_subscription'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, ua, fail_count, last_seen_at)
  VALUES (_uid, _endpoint, _p256dh, _auth, _ua, 0, now())
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
    ua = EXCLUDED.ua, fail_count = 0, last_seen_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(_endpoint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.push_subscriptions WHERE endpoint = _endpoint AND user_id = _uid;
END $$;

CREATE OR REPLACE FUNCTION public.save_push_prefs(_radius int, _sos_optin boolean, _max_per_week int, _wake_me boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.profiles SET
    buddy_radius_km = LEAST(100, GREATEST(1, COALESCE(_radius, buddy_radius_km))),
    buddy_sos_optin = COALESCE(_sos_optin, buddy_sos_optin),
    push_max_per_week = LEAST(50, GREATEST(1, COALESCE(_max_per_week, push_max_per_week))),
    push_wake_me = COALESCE(_wake_me, push_wake_me)
  WHERE id = _uid;
END $$;

GRANT EXECUTE ON FUNCTION public.save_push_subscription(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_push_prefs(int,boolean,int,boolean) TO authenticated;

-- ===== 20260621140000_sos_push_targets.sql =====
CREATE OR REPLACE FUNCTION public.sos_push_targets(_sos_id uuid)
RETURNS TABLE(user_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT sr.caller_id, sr.status, sr.level_min, sr.level_max, c.city AS court_city
    FROM public.sos_requests sr
    LEFT JOIN public.courts c ON c.id = sr.court_id
    WHERE sr.id = _sos_id
  ),
  n AS (SELECT EXTRACT(hour FROM (now() AT TIME ZONE 'Europe/Stockholm'))::int AS hr)
  SELECT ps.user_id, ps.endpoint, ps.p256dh, ps.auth
  FROM s
  JOIN public.profiles p ON p.id <> s.caller_id
  JOIN public.push_subscriptions ps ON ps.user_id = p.id
  CROSS JOIN n
  WHERE s.status = 'active'
    AND p.buddy_sos_optin = true
    AND p.level BETWEEN s.level_min AND s.level_max
    AND (p.home_city = s.court_city OR s.court_city = ANY (COALESCE(p.home_cities, ARRAY[]::text[])))
    AND (p.push_wake_me OR (n.hr >= 7 AND n.hr < 22))
    AND (SELECT count(*) FROM public.push_events pe WHERE pe.user_id = p.id AND pe.sent_at > now() - interval '7 days') < p.push_max_per_week;
$$;
REVOKE ALL ON FUNCTION public.sos_push_targets(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.sos_push_targets(uuid) TO service_role;

-- ===== 20260623120000_cancel_and_notify.sql =====
CREATE OR REPLACE FUNCTION public.cancel_game(_sos_id uuid)
RETURNS TABLE(claimer_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ids uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sos_requests WHERE id = _sos_id AND caller_id = _uid) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT g.player_b), '{}') INTO _ids
    FROM public.games g WHERE g.sos_id = _sos_id AND g.player_b <> _uid;
  UPDATE public.sos_requests SET status = 'cancelled' WHERE id = _sos_id AND caller_id = _uid;
  DELETE FROM public.games WHERE sos_id = _sos_id AND confirmed_a = false AND confirmed_b = false;
  RETURN QUERY SELECT _ids;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_game(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sos_push_targets(_sos_id uuid)
RETURNS TABLE(user_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT sr.caller_id, sr.status, sr.level_min, sr.level_max, c.city AS court_city
    FROM public.sos_requests sr
    LEFT JOIN public.courts c ON c.id = sr.court_id
    WHERE sr.id = _sos_id
  ),
  n AS (SELECT EXTRACT(hour FROM (now() AT TIME ZONE 'Europe/Stockholm'))::int AS hr)
  SELECT ps.user_id, ps.endpoint, ps.p256dh, ps.auth
  FROM s
  JOIN public.profiles p ON p.id <> s.caller_id
  JOIN public.push_subscriptions ps ON ps.user_id = p.id
  CROSS JOIN n
  WHERE s.status = 'active'
    AND p.buddy_sos_optin = true
    AND p.level BETWEEN s.level_min AND s.level_max
    AND (p.home_city = s.court_city OR s.court_city = ANY (COALESCE(p.home_cities, ARRAY[]::text[])))
    AND (p.push_wake_me OR (n.hr >= 7 AND n.hr < 22))
    AND (SELECT count(*) FROM public.push_events pe WHERE pe.user_id = p.id AND pe.kind = 'sos' AND pe.sent_at > now() - interval '7 days') < p.push_max_per_week;
$$;
REVOKE ALL ON FUNCTION public.sos_push_targets(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.sos_push_targets(uuid) TO service_role;

-- ===== 20260623130000_announcements.sql =====
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  link text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
DROP POLICY IF EXISTS "active announcements readable" ON public.announcements;
CREATE POLICY "active announcements readable" ON public.announcements
  FOR SELECT TO authenticated USING (active = true);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements (active, created_at DESC);

CREATE OR REPLACE FUNCTION public.post_announcement(_body text, _link text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _body IS NULL OR length(trim(_body)) = 0 THEN RAISE EXCEPTION 'empty'; END IF;
  UPDATE public.announcements SET active = false WHERE active = true;
  INSERT INTO public.announcements (body, link, created_by)
  VALUES (trim(_body), NULLIF(trim(_link), ''), auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.clear_announcements()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.announcements SET active = false WHERE active = true;
END $$;

GRANT EXECUTE ON FUNCTION public.post_announcement(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_announcements() TO authenticated;

-- ===== 20260623140000_game_score.sql =====
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS score text;

DROP FUNCTION IF EXISTS public.confirm_game(uuid);
CREATE OR REPLACE FUNCTION public.confirm_game(_game_id uuid, _score text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _g public.games;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _uid = _g.player_a THEN
    UPDATE public.games SET confirmed_a = true WHERE id = _game_id;
  ELSIF _uid = _g.player_b THEN
    UPDATE public.games SET confirmed_b = true WHERE id = _game_id;
  ELSE
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF _score IS NOT NULL AND length(trim(_score)) > 0 THEN
    UPDATE public.games SET score = left(trim(_score), 40) WHERE id = _game_id;
  END IF;
  IF (SELECT confirmed_a AND confirmed_b FROM public.games WHERE id = _game_id) THEN
    UPDATE public.profiles SET ghost_badge = false WHERE id IN (_g.player_a, _g.player_b);
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.confirm_game(uuid, text) TO authenticated;

-- ===== 20260623150000_referrals.sql =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referrals_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._buddy_on_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  IF NEW.signup_code IS NULL THEN RETURN NEW; END IF;
  SELECT owner_id INTO _owner FROM public.invite_codes WHERE code = upper(NEW.signup_code);
  IF _owner IS NOT NULL AND _owner <> NEW.id THEN
    PERFORM public._add_buddy(_owner, NEW.id, 'invite');
    UPDATE public.profiles SET referrals_count = referrals_count + 1 WHERE id = _owner;
  END IF;
  RETURN NEW;
END; $$;

-- ===== 20260623160000_lucky_serve.sql =====
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

-- ===== 20260623170000_swipe_deck.sql =====
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
DROP POLICY IF EXISTS "own swipes readable" ON public.swipes;
CREATE POLICY "own swipes readable" ON public.swipes
  FOR SELECT TO authenticated USING (auth.uid() = liker_id);
CREATE INDEX IF NOT EXISTS idx_swipes_liker ON public.swipes (liker_id);
CREATE INDEX IF NOT EXISTS idx_swipes_target_liked ON public.swipes (target_id, liked);

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

-- ===== 20260624120000_game_duration.sql =====
ALTER TABLE public.sos_requests ADD COLUMN IF NOT EXISTS duration_min int NOT NULL DEFAULT 60;

NOTIFY pgrst, 'reload schema';