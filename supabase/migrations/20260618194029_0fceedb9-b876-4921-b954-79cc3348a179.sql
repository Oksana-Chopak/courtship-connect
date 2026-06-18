-- Revert to broad authenticated SELECT, but lock sensitive columns at the GRANT level
DROP POLICY IF EXISTS "users select own profile" ON public.profiles;
CREATE POLICY "profiles visible to authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, name, photo_url, level, formats, play_times, vibe, looking_for,
  home_courts, home_city, home_cities, buddy_optin, buddy_sos_optin, buddy_radius_km,
  rescues_count, ghost_badge, created_at, lang
) ON public.profiles TO authenticated;

-- Rebuild profiles_public as security_invoker (no "Security Definer View" lint)
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public WITH (security_invoker = true) AS
  SELECT id, name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, created_at
    FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;

-- Owner-only full profile (includes phone_e164, is_admin, signup_code for self)
CREATE OR REPLACE FUNCTION public.get_my_full_profile()
RETURNS public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_full_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_full_profile() TO authenticated;

-- Phone disclosure only between players with an existing relationship
CREATE OR REPLACE FUNCTION public.get_contact_phone(_target uuid)
RETURNS TABLE(phone text, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _me = _target
     OR public.is_buddy(_me, _target)
     OR EXISTS (
       SELECT 1 FROM public.games g
        WHERE (g.player_a = _me AND g.player_b = _target)
           OR (g.player_a = _target AND g.player_b = _me)
     ) THEN
    RETURN QUERY SELECT p.phone_e164, p.name FROM public.profiles p WHERE p.id = _target;
    RETURN;
  END IF;
  RAISE EXCEPTION 'forbidden';
END $$;
REVOKE ALL ON FUNCTION public.get_contact_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_phone(uuid) TO authenticated;