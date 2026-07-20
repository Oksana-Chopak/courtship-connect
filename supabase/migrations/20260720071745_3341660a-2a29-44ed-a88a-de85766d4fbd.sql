CREATE OR REPLACE FUNCTION public.public_game(_id uuid)
RETURNS TABLE(
  id uuid, kind text, status text, play_at timestamptz, play_until timestamptz,
  format text, level_min int, level_max int,
  court_name text, court_city text, court_type text, court_type_any boolean, court_status text,
  spots_needed int, spots_filled int,
  host_name text, host_photo text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.kind::text, s.status::text, s.play_at, s.play_until,
         s.format::text, s.level_min, s.level_max,
         c.name, c.city, s.court_type::text, coalesce(s.court_type_any, false), s.court_status::text,
         s.spots_needed, s.spots_filled,
         CASE WHEN p.is_admin = true AND s.ghost_name IS NOT NULL THEN s.ghost_name ELSE p.name END,
         CASE WHEN p.is_admin = true AND s.ghost_name IS NOT NULL THEN NULL ELSE p.photo_url END
    FROM public.sos_requests s
    JOIN public.courts c ON c.id = s.court_id
    JOIN public.profiles p ON p.id = s.caller_id
   WHERE s.id = _id
     AND coalesce(s.broadcast, true) = true;
$$;

GRANT EXECUTE ON FUNCTION public.public_game(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';