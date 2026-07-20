CREATE OR REPLACE FUNCTION public.expire_old_sos()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sos_requests SET status = 'expired'
   WHERE status = 'active' AND coalesce(play_until, play_at) < now();
$$;

UPDATE public.sos_requests
   SET status = 'active'
 WHERE status = 'expired'
   AND play_until IS NOT NULL
   AND play_until > now();

NOTIFY pgrst, 'reload schema';

SELECT
 (SELECT prosrc LIKE '%coalesce(play_until, play_at)%' FROM pg_proc WHERE proname='expire_old_sos') AS expiry_window_aware,
 (SELECT count(*) FROM public.sos_requests WHERE status='active' AND play_until > now())            AS live_windowed_games_now;

SELECT s.id, s.play_at, s.play_until, s.status, s.spots_filled,
       (SELECT count(*) FROM public.sos_applications a WHERE a.sos_id = s.id AND a.status='pending') AS pending_candidates
  FROM public.sos_requests s
 WHERE s.play_until IS NOT NULL AND s.play_until > now() - interval '1 day'
 ORDER BY s.created_at DESC LIMIT 5;