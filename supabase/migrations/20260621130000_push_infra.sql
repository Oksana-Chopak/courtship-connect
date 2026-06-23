-- Iteration 1 — Web Push infrastructure for "Save My Set".
-- Until now the app only called Notification.requestPermission() (foreground
-- only). This adds real delivery: subscriptions, send-log, user controls, and
-- the policy surface the edge function uses to decide WHO gets pinged.

-- ── A. Profile push controls (radius + sos opt-in already exist; add the rest)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_max_per_week int     NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS push_wake_me      boolean NOT NULL DEFAULT false; -- override 22:00–07:00 quiet hours

-- ── B. Web Push subscriptions (one per browser/device)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  ua          text,
  fail_count  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Owner can read own subs; writes go through SECURITY DEFINER RPCs only.
GRANT SELECT ON public.push_subscriptions TO authenticated;
GRANT ALL    ON public.push_subscriptions TO service_role;
CREATE POLICY "own subscriptions readable" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions (user_id);

-- ── C. Send-log: powers the weekly cap AND gives us observability
CREATE TABLE IF NOT EXISTS public.push_events (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sos_id   uuid REFERENCES public.sos_requests(id) ON DELETE SET NULL,
  kind     text NOT NULL DEFAULT 'sos',
  sent_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.push_events TO authenticated;
GRANT ALL    ON public.push_events TO service_role;
CREATE POLICY "own push events readable" ON public.push_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_push_events_user_sent ON public.push_events (user_id, sent_at);

-- ── D. RPCs (client write path; own row only)
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

-- Push preference controls (reuses existing buddy_radius_km + buddy_sos_optin).
CREATE OR REPLACE FUNCTION public.save_push_prefs(_radius int, _sos_optin boolean, _max_per_week int, _wake_me boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.profiles SET
    buddy_radius_km   = LEAST(100, GREATEST(1, COALESCE(_radius, buddy_radius_km))),
    buddy_sos_optin   = COALESCE(_sos_optin, buddy_sos_optin),
    push_max_per_week = LEAST(50, GREATEST(1, COALESCE(_max_per_week, push_max_per_week))),
    push_wake_me      = COALESCE(_wake_me, push_wake_me)
  WHERE id = _uid;
END $$;

GRANT EXECUTE ON FUNCTION public.save_push_subscription(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_push_prefs(int,boolean,int,boolean) TO authenticated;
