-- ═══════════════════════════════════════════════════════════════════
-- PACKAGE 3 (2026-10-05) — paste in the Supabase SQL editor. Idempotent.
--   1. Swish number for memberships/support → 0700266274
--   2. Presence + home-screen install tracking (profiles.last_seen_at,
--      installed_at, last_standalone_at; touch_presence RPC)
--   3. Membership claims: "I've sent the Swish" → admin sees + approves
--   4. admin_players_list v3 (+ tier, installed, last seen, push, email level)
--   5. _push_users with the notify secret restored + _email_users (email only)
--   6. Buddies get a push + email when a friend posts a game
-- ═══════════════════════════════════════════════════════════════════

-- ▌1. Swish number (same app_config row the Plans page and SupportCard read)
INSERT INTO public.app_config (key, value) VALUES ('support_swish', '0700266274')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ▌2. Presence + installs
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS installed_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_standalone_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_presence(_standalone boolean DEFAULT false)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles
     SET last_seen_at = now(),
         installed_at = CASE WHEN _standalone THEN coalesce(installed_at, now()) ELSE installed_at END,
         last_standalone_at = CASE WHEN _standalone THEN now() ELSE last_standalone_at END
   WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.touch_presence(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_presence(boolean) TO authenticated;

-- ▌3. Membership claims
CREATE TABLE IF NOT EXISTS public.membership_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier        text NOT NULL CHECK (tier IN ('founding', 'pro')),
  period      text NOT NULL CHECK (period IN ('monthly', 'yearly')),
  amount_sek  int  NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.membership_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.membership_claims TO service_role;

-- ▌5a. _push_users (push + email) — the 6-arg version Lovable generated on
-- 2026-07-25 dropped the x-notify-secret header that BATCH3 added; with
-- NOTIFY_SECRET set in Edge secrets every DB-side push/email was refused.
-- Restored here: same signature, secret read from internal_config when present.
CREATE TABLE IF NOT EXISTS public.internal_config (key text PRIMARY KEY, value text NOT NULL);
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_config FROM PUBLIC, anon, authenticated;
INSERT INTO public.internal_config (key, value)
VALUES ('notify_secret', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public._notify_headers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _secret text; _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps';
BEGIN
  BEGIN
    SELECT value INTO _secret FROM public.internal_config WHERE key = 'notify_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _secret := NULL; END;
  RETURN jsonb_build_object('Content-Type', 'application/json', 'apikey', _anon, 'Authorization', 'Bearer ' || _anon)
      || CASE WHEN _secret IS NOT NULL THEN jsonb_build_object('x-notify-secret', _secret) ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION public._notify_headers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._push_users(_ids uuid[], _title text, _body text, _url text, _tag text, _kind text DEFAULT 'critical')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _hdrs jsonb; _payload jsonb;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN; END IF;
  _hdrs := public._notify_headers();
  _payload := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag, 'kind', coalesce(_kind, 'critical'));
  BEGIN
    PERFORM net.http_post(url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/notify-users', headers := _hdrs, body := _payload);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    PERFORM net.http_post(url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/email-notify', headers := _hdrs, body := _payload);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
REVOKE ALL ON FUNCTION public._push_users(uuid[], text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ▌5b. Email only (no push) — for things the push channel already covers
CREATE OR REPLACE FUNCTION public._email_users(_ids uuid[], _title text, _body text, _url text, _tag text, _kind text DEFAULT 'critical')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN; END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/email-notify',
      headers := public._notify_headers(),
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag, 'kind', coalesce(_kind, 'critical')));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
REVOKE ALL ON FUNCTION public._email_users(uuid[], text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ▌3 (cont). Claim RPCs
CREATE OR REPLACE FUNCTION public.claim_membership(_tier text, _period text, _amount int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _name text; _admins uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _tier NOT IN ('founding', 'pro') OR _period NOT IN ('monthly', 'yearly') THEN RAISE EXCEPTION 'bad_claim'; END IF;
  IF _amount IS NULL OR _amount < 1 OR _amount > 100000 THEN RAISE EXCEPTION 'bad_amount'; END IF;
  -- one open claim per user and tier; a repeat tap just refreshes it
  UPDATE public.membership_claims SET period = _period, amount_sek = _amount, created_at = now()
   WHERE user_id = _uid AND tier = _tier AND status = 'pending' RETURNING id INTO _id;
  IF _id IS NULL THEN
    INSERT INTO public.membership_claims (user_id, tier, period, amount_sek)
    VALUES (_uid, _tier, _period, _amount) RETURNING id INTO _id;
  END IF;
  SELECT name INTO _name FROM public.profiles WHERE id = _uid;
  SELECT array_agg(id) INTO _admins FROM public.profiles WHERE is_admin AND id <> _uid;
  PERFORM public._push_users(_admins,
    '💸 Swish: ' || coalesce(_name, 'A player') || ' says they paid',
    _tier || ' · ' || _period || ' · ' || _amount || ' kr. Check Swish, then approve in Admin.',
    '/admin', 'claim-' || _id::text, 'critical');
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.claim_membership(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_membership(text, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_membership_claims()
RETURNS TABLE (id uuid, tier text, period text, amount_sek int, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, tier, period, amount_sek, status, created_at
    FROM public.membership_claims WHERE user_id = auth.uid() ORDER BY created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.my_membership_claims() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_membership_claims() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_membership_claims()
RETURNS TABLE (id uuid, user_id uuid, name text, last_name text, tier text, period text, amount_sek int, status text, created_at timestamptz, resolved_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.user_id, p.name, p.last_name, c.tier, c.period, c.amount_sek, c.status, c.created_at, c.resolved_at
    FROM public.membership_claims c JOIN public.profiles p ON p.id = c.user_id
   WHERE EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.is_admin)
   ORDER BY (c.status = 'pending') DESC, c.created_at DESC
   LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.admin_membership_claims() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_membership_claims() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_claim(_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.membership_claims;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO _c FROM public.membership_claims WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE public.membership_claims
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'dismissed' END, resolved_at = now()
   WHERE id = _id;
  IF _approve THEN
    UPDATE public.profiles SET member_tier = _c.tier, member_since = coalesce(member_since, now()) WHERE id = _c.user_id;
    PERFORM public._push_users(ARRAY[_c.user_id],
      CASE WHEN _c.tier = 'pro' THEN '💼 Courtship Pro is on' ELSE '🏆 You''re a Founding Member' END,
      'Thank you for backing Courtship — your badge is live. See you on court!',
      '/me', 'member-' || _c.user_id::text, 'critical');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_resolve_claim(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_claim(uuid, boolean) TO authenticated;

-- ▌4. admin_players_list v3
DROP FUNCTION IF EXISTS public.admin_players_list();
CREATE FUNCTION public.admin_players_list()
RETURNS TABLE(
  id uuid, name text, last_name text, phone_e164 text, level int,
  formats text[], play_times text[], vibe vibe_t, looking_for looking_for_t,
  home_courts text, home_city text, home_cities text[],
  buddy_optin buddy_optin_t, buddy_radius_km int, buddy_sos_optin boolean,
  bio text, fav_shot text, games_played int, rescues_count int,
  ghost_badge boolean, is_admin boolean, signup_code text, created_at timestamptz,
  member_tier text, member_since timestamptz, installed_at timestamptz, last_seen_at timestamptz,
  push_on boolean, email_level text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.last_name, p.phone_e164, p.level, p.formats, p.play_times, p.vibe, p.looking_for,
         p.home_courts, p.home_city, p.home_cities, p.buddy_optin, p.buddy_radius_km, p.buddy_sos_optin,
         p.bio, p.fav_shot, p.games_played, p.rescues_count, p.ghost_badge, p.is_admin, p.signup_code, p.created_at,
         p.member_tier, p.member_since, p.installed_at, p.last_seen_at,
         EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = p.id) AS push_on,
         p.email_level
    FROM public.profiles p
   WHERE EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.is_admin)
   ORDER BY p.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_players_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_players_list() TO authenticated;

-- ▌6. A friend posted a game → buddies hear about it.
-- Planned game: push + email. SOS: email only (eligible rescuers already get
-- the SOS push from sos-notify — no double buzz). Private (broadcast=false)
-- and ghost games stay quiet.
CREATE OR REPLACE FUNCTION public.notify_buddies_new_game()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ids uuid[]; _name text; _court text; _when text; _title text; _body text;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.broadcast IS FALSE THEN RETURN NEW; END IF;
  IF NEW.ghost_name IS NOT NULL THEN RETURN NEW; END IF;
  SELECT array_agg(CASE WHEN b.user_low = NEW.caller_id THEN b.user_high ELSE b.user_low END)
    INTO _ids FROM public.buddies b WHERE b.user_low = NEW.caller_id OR b.user_high = NEW.caller_id;
  IF _ids IS NULL THEN RETURN NEW; END IF;
  SELECT name INTO _name FROM public.profiles WHERE id = NEW.caller_id;
  SELECT name INTO _court FROM public.courts WHERE id = NEW.court_id;
  _when := to_char(NEW.play_at AT TIME ZONE 'Europe/Stockholm', 'Dy DD Mon HH24:MI');
  _body := _when || ' at ' || coalesce(_court, 'the court') || ' · ' || coalesce(NEW.format, 'singles')
        || ' · L' || NEW.level_min || '–' || NEW.level_max || '. Tap to join 🎾';
  IF NEW.kind = 'sos' THEN
    _title := '🚨 ' || coalesce(_name, 'A friend') || ' needs a partner';
    PERFORM public._email_users(_ids, _title, _body, '/sos/' || NEW.id::text, 'buddygame-' || NEW.id::text, 'critical');
  ELSE
    _title := '🎾 ' || coalesce(_name, 'A friend') || ' posted a game';
    PERFORM public._push_users(_ids, _title, _body, '/sos/' || NEW.id::text, 'buddygame-' || NEW.id::text, 'critical');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- notifications never block a post
END $$;

DROP TRIGGER IF EXISTS trg_notify_buddies_new_game ON public.sos_requests;
CREATE TRIGGER trg_notify_buddies_new_game
  AFTER INSERT ON public.sos_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_buddies_new_game();

NOTIFY pgrst, 'reload schema';

-- ▌VERIFY — all true
SELECT
  (SELECT value FROM public.app_config WHERE key = 'support_swish') = '0700266274'                                   AS swish_set,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'installed_at')   AS installs_tracked,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_membership')                                                  AS claims_ready,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_buddies_new_game')                                     AS buddy_mail_on,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_players_list')                                                AS admin_list_v3;

-- ═══════════════════════════════════════════════════════════════════
-- ▌7. Lifecycle emails (welcome · install · community · invite · come-back ·
--     Monday digest) — engine = Edge Function `lifecycle-emails`.
--     OFF until Admin flips "Lifecycle emails" on (app_config.lifecycle_enabled).
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lifecycle_sends (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL,
  template  text NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lifecycle_sends_user_template_idx ON public.lifecycle_sends (user_id, template, sent_at DESC);
ALTER TABLE public.lifecycle_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lifecycle_sends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lifecycle_sends TO service_role;

INSERT INTO public.app_config (key, value) VALUES ('lifecycle_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_set_lifecycle(_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN RAISE EXCEPTION 'admin only'; END IF;
  INSERT INTO public.app_config (key, value) VALUES ('lifecycle_enabled', CASE WHEN _on THEN 'true' ELSE 'false' END)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.admin_set_lifecycle(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_lifecycle(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_lifecycle_status()
RETURNS TABLE (enabled boolean, template text, sent_7d bigint, sent_30d bigint, last_sent timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (SELECT coalesce((SELECT value = 'true' FROM public.app_config WHERE key = 'lifecycle_enabled'), false) AS enabled)
  SELECT e.enabled, s.template,
         count(*) FILTER (WHERE s.sent_at > now() - interval '7 days'),
         count(*) FILTER (WHERE s.sent_at > now() - interval '30 days'),
         max(s.sent_at)
    FROM e LEFT JOIN public.lifecycle_sends s ON true
   WHERE EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.is_admin)
   GROUP BY e.enabled, s.template
   ORDER BY s.template;
$$;
REVOKE ALL ON FUNCTION public.admin_lifecycle_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lifecycle_status() TO authenticated;

-- welcome_0 the moment a profile is created (the engine checks the on/off switch)
CREATE OR REPLACE FUNCTION public.lifecycle_welcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/lifecycle-emails',
      headers := public._notify_headers(),
      body := jsonb_build_object('template', 'welcome_0', 'user_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lifecycle_welcome ON public.profiles;
CREATE TRIGGER trg_lifecycle_welcome AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.lifecycle_welcome();

-- daily run at 06:00 UTC (08:00 Stockholm in summer, 07:00 in winter)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'courtship-lifecycle-emails';
    PERFORM cron.schedule('courtship-lifecycle-emails', '0 6 * * *',
      $cron$ SELECT net.http_post(url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/lifecycle-emails', headers := public._notify_headers(), body := '{"run":"daily"}'::jsonb); $cron$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ▌VERIFY 2 — all true
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'lifecycle_sends')                           AS lifecycle_ledger,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lifecycle_welcome')                      AS welcome_trigger,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'courtship-lifecycle-emails')                  AS daily_cron,
  (SELECT value FROM public.app_config WHERE key = 'lifecycle_enabled') = 'false'               AS lifecycle_off_until_you_flip_it;
