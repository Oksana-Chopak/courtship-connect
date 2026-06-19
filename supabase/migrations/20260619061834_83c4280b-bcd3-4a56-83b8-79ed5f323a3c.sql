ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text;
GRANT SELECT (last_name) ON public.profiles TO authenticated;

DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public WITH (security_invoker = true) AS
  SELECT id, name, last_name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, created_at
    FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;