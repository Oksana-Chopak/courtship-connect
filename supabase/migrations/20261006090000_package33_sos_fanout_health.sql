-- ═══════════════════════════════════════════════════════════════════
-- PACKAGE 3.3 (2026-10-06) — paste in Lovable → More → Cloud → SQL editor. Idempotent.
--   1. New SOS posts fan out from the DATABASE (sos-notify), not from the
--      browser. The browser call never worked (CORS) — see the function fix.
--   2. Health: every error a player meets lands in client_errors
--      (report_client_error), and Admin → Health reads the last 24h
--      (admin_client_errors) plus server facts (admin_health): failed
--      webhook calls, push/email counts, cron, lifecycle switch.
-- Needs Package 3 applied (public._notify_headers()).
-- ═══════════════════════════════════════════════════════════════════

-- ▌1. SOS fan-out on insert (sos-notify re-reads the row and targets by city/level)
CREATE OR REPLACE FUNCTION public.notify_sos_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'sos' AND NEW.status = 'active' AND coalesce(NEW.broadcast, true) THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/sos-notify',
        headers := public._notify_headers(),
        body := jsonb_build_object('sos_id', NEW.id));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_sos_on_insert ON public.sos_requests;
CREATE TRIGGER trg_notify_sos_on_insert
  AFTER INSERT ON public.sos_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_sos_on_insert();

-- ▌2. Client errors — what players actually hit
CREATE TABLE IF NOT EXISTS public.client_errors (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at       timestamptz NOT NULL DEFAULT now(),
  user_id  uuid,
  kind     text NOT NULL,
  message  text NOT NULL,
  where_   text NOT NULL,
  details  text,
  ua       text
);
CREATE INDEX IF NOT EXISTS client_errors_at_idx ON public.client_errors (at DESC);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_errors TO service_role;

CREATE OR REPLACE FUNCTION public.report_client_error(_kind text, _message text, _where text, _details text DEFAULT NULL, _ua text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _recent int;
BEGIN
  IF coalesce(trim(_message), '') = '' THEN RETURN; END IF;
  -- flood guard: 30 rows per user (or per anonymous message) per 10 minutes
  SELECT count(*) INTO _recent FROM public.client_errors
   WHERE at > now() - interval '10 minutes'
     AND ((_uid IS NOT NULL AND user_id = _uid) OR (_uid IS NULL AND user_id IS NULL AND message = left(_message, 500)));
  IF _recent >= 30 THEN RETURN; END IF;
  INSERT INTO public.client_errors (user_id, kind, message, where_, details, ua)
  VALUES (_uid, left(coalesce(_kind, 'error'), 20), left(_message, 500), left(coalesce(_where, '?'), 120), left(_details, 2000), left(_ua, 200));
  -- storage limitation: keep 30 days (cheap, runs on ~1% of inserts)
  IF random() < 0.01 THEN DELETE FROM public.client_errors WHERE at < now() - interval '30 days'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.report_client_error(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_client_error(text, text, text, text, text) TO anon, authenticated;

-- ▌3. Admin: errors of the last N hours, grouped
CREATE OR REPLACE FUNCTION public.admin_client_errors(_hours int DEFAULT 24)
RETURNS TABLE(kind text, message text, where_ text, n bigint, users bigint, last_at timestamptz, sample text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.kind, e.message, e.where_, count(*) AS n, count(DISTINCT e.user_id) AS users, max(e.at) AS last_at,
         (array_agg(e.details ORDER BY e.at DESC))[1] AS sample
    FROM public.client_errors e
   WHERE e.at > now() - make_interval(hours => greatest(1, least(_hours, 24 * 30)))
     AND EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.is_admin)
   GROUP BY e.kind, e.message, e.where_
   ORDER BY max(e.at) DESC
   LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.admin_client_errors(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_client_errors(int) TO authenticated;

-- ▌4. Admin: server facts (what the DB and its webhooks did in the last 24h)
CREATE OR REPLACE FUNCTION public.admin_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb; _net jsonb := '{}'::jsonb; _cron jsonb := '[]'::jsonb; _lc_last timestamptz; _lc_on text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.is_admin) THEN
    RETURN jsonb_build_object('error', 'not_admin');
  END IF;
  -- pg_net: the DB's calls to the edge functions (404 = not deployed, 401 = refused, 5xx = crashed)
  BEGIN
    SELECT jsonb_build_object(
      'total',  count(*),
      'failed', count(*) FILTER (WHERE coalesce(status_code, 0) >= 400 OR timed_out OR error_msg IS NOT NULL),
      'by_status', coalesce((SELECT jsonb_object_agg(k, v) FROM (
                      SELECT coalesce(status_code::text, coalesce(error_msg, 'timeout')) AS k, count(*) AS v
                        FROM net._http_response WHERE created > now() - interval '24 hours'
                       GROUP BY 1) s), '{}'::jsonb),
      'samples', coalesce((SELECT jsonb_agg(jsonb_build_object('status', status_code, 'error', error_msg, 'body', left(content, 160), 'at', created) ORDER BY created DESC)
                           FROM (SELECT * FROM net._http_response
                                  WHERE created > now() - interval '24 hours'
                                    AND (coalesce(status_code, 0) >= 400 OR timed_out OR error_msg IS NOT NULL)
                                  ORDER BY created DESC LIMIT 5) f), '[]'::jsonb))
      INTO _net
      FROM net._http_response WHERE created > now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN _net := jsonb_build_object('unavailable', SQLERRM); END;
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active)), '[]'::jsonb) INTO _cron FROM cron.job;
  EXCEPTION WHEN OTHERS THEN _cron := '[]'::jsonb; END;
  BEGIN SELECT max(sent_at) INTO _lc_last FROM public.lifecycle_sends; EXCEPTION WHEN OTHERS THEN _lc_last := NULL; END;
  BEGIN SELECT value INTO _lc_on FROM public.app_config WHERE key = 'lifecycle_enabled'; EXCEPTION WHEN OTHERS THEN _lc_on := NULL; END;
  _out := jsonb_build_object(
    'at', now(),
    'profiles', (SELECT count(*) FROM public.profiles),
    'push_subscriptions', (SELECT count(*) FROM public.push_subscriptions),
    'push_users', (SELECT count(DISTINCT user_id) FROM public.push_subscriptions),
    'pushes_24h', (SELECT count(*) FROM public.push_events WHERE sent_at > now() - interval '24 hours'),
    'emails_24h', (SELECT jsonb_build_object('sent', count(*) FILTER (WHERE status = 'sent'), 'failed', count(*) FILTER (WHERE status IN ('failed', 'bounced', 'dlq')))
                     FROM public.email_send_log WHERE created_at > now() - interval '24 hours'),
    'lifecycle_enabled', _lc_on = 'true',
    'lifecycle_last_sent', _lc_last,
    'open_games', (SELECT count(*) FROM public.sos_requests WHERE status = 'active' AND play_at > now()),
    'pending_events', (SELECT count(*) FROM public.event_requests WHERE status = 'pending'),
    'client_errors_24h', (SELECT count(*) FROM public.client_errors WHERE at > now() - interval '24 hours'),
    'cron', _cron,
    'net', _net
  );
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.admin_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_health() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ▌VERIFY — all true
SELECT
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_sos_on_insert')    AS sos_fanout_from_db,
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'client_errors')             AS client_errors_table,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'report_client_error')          AS report_rpc,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_health')                  AS health_rpc;
