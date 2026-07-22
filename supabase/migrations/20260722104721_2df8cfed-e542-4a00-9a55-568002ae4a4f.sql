CREATE OR REPLACE FUNCTION public.public_board()
RETURNS TABLE(
  id uuid, kind text, play_at timestamptz, created_at timestamptz,
  format text, level_min int, level_max int,
  spots_needed int, spots_filled int,
  court_name text, court_city text, court_type text, court_status text,
  caller_id uuid, caller_name text, caller_photo text, sport text,
  play_until timestamptz, court_type_any boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.kind::text, s.play_at, s.created_at,
         s.format::text, s.level_min, s.level_max,
         s.spots_needed, s.spots_filled,
         c.name, c.city, s.court_type::text, s.court_status::text,
         p.id,
         CASE WHEN p.is_admin = true AND s.ghost_name IS NOT NULL
              THEN s.ghost_name ELSE p.name END,
         CASE WHEN p.is_admin = true AND s.ghost_name IS NOT NULL
              THEN NULL ELSE p.photo_url END,
         s.sport,
         s.play_until, coalesce(s.court_type_any, false)
    FROM public.sos_requests s
    JOIN public.courts c ON c.id = s.court_id
    JOIN public.profiles p ON p.id = s.caller_id
   WHERE s.status = 'active'
     AND coalesce(s.play_until, s.play_at) > now()
     AND coalesce(s.broadcast, true) = true
     AND p.public_preview
   ORDER BY s.play_at ASC
   LIMIT 50;
$$;

NOTIFY pgrst, 'reload schema';