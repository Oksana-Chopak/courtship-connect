DROP POLICY IF EXISTS event_requests_insert ON public.event_requests;
CREATE POLICY event_requests_insert ON public.event_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    host_id = auth.uid()
    AND (status = 'pending'
         OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  );

CREATE OR REPLACE FUNCTION public.auto_approve_admin_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.host_id AND is_admin) THEN
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_approve_admin_events ON public.event_requests;
CREATE TRIGGER trg_auto_approve_admin_events
  BEFORE INSERT ON public.event_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_approve_admin_events();

DROP FUNCTION IF EXISTS public.admin_players_list();
CREATE FUNCTION public.admin_players_list()
RETURNS TABLE(
  id uuid, name text, last_name text, phone_e164 text, level int,
  formats text[], play_times text[], vibe vibe_t, looking_for looking_for_t,
  home_courts text, home_city text, home_cities text[],
  buddy_optin buddy_optin_t, buddy_radius_km int, buddy_sos_optin boolean,
  bio text, fav_shot text, games_played int, rescues_count int,
  ghost_badge boolean, is_admin boolean, signup_code text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, last_name, phone_e164, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km, buddy_sos_optin,
         bio, fav_shot, games_played, rescues_count, ghost_badge, is_admin, signup_code, created_at
    FROM public.profiles
   WHERE EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.is_admin)
   ORDER BY created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_players_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_players_list() TO authenticated;