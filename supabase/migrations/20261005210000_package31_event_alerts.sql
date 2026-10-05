-- ═══════════════════════════════════════════════════════════════════
-- PACKAGE 3.1 (2026-10-05) — paste in Lovable → More → Cloud → SQL editor. Idempotent.
--   1. Admins get a push + email the moment someone posts an event that
--      needs approval (Oxy missed one on 2026-10-05: nothing told her).
--   2. The host hears the decision: approved → "your event is live" with the
--      public link; rejected → a friendly note to reply to Oksana.
-- Needs Package 3 applied first (public._push_users with 6 args).
-- ═══════════════════════════════════════════════════════════════════

-- ▌1. Admins: new event waiting for approval
CREATE OR REPLACE FUNCTION public.notify_admins_event_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admins uuid[]; _host text; _when text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
  SELECT array_agg(id) INTO _admins FROM public.profiles WHERE is_admin AND id <> NEW.host_id;
  IF _admins IS NULL THEN RETURN NEW; END IF;
  SELECT name INTO _host FROM public.profiles WHERE id = NEW.host_id;
  _when := to_char(NEW.starts_at AT TIME ZONE 'Europe/Stockholm', 'Dy DD Mon HH24:MI');
  PERFORM public._push_users(
    _admins,
    '🎉 Event to approve: ' || coalesce(NEW.title, 'untitled'),
    coalesce(_host, 'A player') || ' · ' || _when || ' · ' || coalesce(NEW.location, NEW.city, '') || ' — open Admin to approve.',
    '/admin',
    'event-pending-' || NEW.id::text,
    'critical');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_admins_event_pending ON public.event_requests;
CREATE TRIGGER trg_notify_admins_event_pending
  AFTER INSERT ON public.event_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_event_pending();

-- ▌2. Host: the decision
CREATE OR REPLACE FUNCTION public.notify_host_event_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    PERFORM public._push_users(
      ARRAY[NEW.host_id],
      '🎉 Your event is live: ' || coalesce(NEW.title, ''),
      'It''s on the board now — share the link so people can join.',
      '/e/' || NEW.id::text,
      'event-live-' || NEW.id::text,
      'critical');
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    PERFORM public._push_users(
      ARRAY[NEW.host_id],
      'About your event: ' || coalesce(NEW.title, ''),
      'We couldn''t publish it as is — reply to this message and Oksana will help you fix it.',
      '/me',
      'event-rejected-' || NEW.id::text,
      'critical');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_host_event_decision ON public.event_requests;
CREATE TRIGGER trg_notify_host_event_decision
  AFTER UPDATE OF status ON public.event_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_host_event_decision();

NOTIFY pgrst, 'reload schema';

-- ▌VERIFY — all true
SELECT
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_admins_event_pending')  AS admins_alerted,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_host_event_decision')   AS host_told,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_push_users' AND pronargs = 6)        AS package3_present;
