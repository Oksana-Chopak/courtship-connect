-- ═══════════════════════════════════════════════════════════════════
-- PACKAGE 3.2 (2026-10-05) — paste in Lovable → More → Cloud → SQL editor. Idempotent.
--   Event announcements follow the player's cities: a player who plays in
--   Uppsala AND Stockholm (profiles.home_cities) now hears about approved
--   events in both, not only in profiles.home_city. New-game pushes already
--   work this way (sos_push_targets); this aligns events with them.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_on_event_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ids uuid[];
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT coalesce(array_agg(p.id), '{}') INTO _ids
      FROM public.profiles p
     WHERE p.events_optin
       AND p.id <> NEW.host_id
       AND NEW.city IS NOT NULL
       AND (p.home_city = NEW.city OR NEW.city = ANY (coalesce(p.home_cities, ARRAY[]::text[])));
    PERFORM public._push_users(
      _ids,
      '🎾 New event' || coalesce(' in ' || NEW.city, '') || '!',
      coalesce(NEW.title, 'A new event') || ' — tap to join.',
      '/e/' || NEW.id::text,
      'event-' || NEW.id::text,
      'critical');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_on_event_approved ON public.event_requests;
CREATE TRIGGER trg_notify_on_event_approved
  AFTER INSERT OR UPDATE OF status ON public.event_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_event_approved();

-- ▌VERIFY — true
SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_on_event_approved') AS events_follow_cities;
