ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS home_cities text[];
UPDATE public.profiles SET home_cities = ARRAY[home_city]
  WHERE home_cities IS NULL AND home_city IS NOT NULL;

DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public WITH (security_invoker = true) AS
  SELECT id, name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, created_at
    FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;