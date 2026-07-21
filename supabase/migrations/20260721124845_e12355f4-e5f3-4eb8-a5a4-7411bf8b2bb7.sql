GRANT EXECUTE ON FUNCTION public.top_active_month()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.top_rescuers_month() TO authenticated;
GRANT EXECUTE ON FUNCTION public.top_hosts_month()    TO authenticated;

DROP FUNCTION IF EXISTS public.public_board();
CREATE FUNCTION public.public_board()
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
         p.id, p.name, p.photo_url, s.sport,
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
REVOKE ALL ON FUNCTION public.public_board() FROM public;
GRANT EXECUTE ON FUNCTION public.public_board() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';