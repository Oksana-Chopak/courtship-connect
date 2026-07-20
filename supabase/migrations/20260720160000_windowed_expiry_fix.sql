-- ═══════════════════════════════════════════════════════════════════
-- 🚑 WINDOWED GAMES WERE EXPIRED AT WINDOW *START* (live bug 2026-07-20).
-- expire_old_sos() predates time-window games and still compared play_at —
-- the 5-min cron killed a 14–19 game at ~14:05: gone from the board, host
-- lost sight of pending candidates, detail page said "Expired".
--  1) expiry now uses the window end;
--  2) resurrect games wrongly expired mid-window (applications were never
--     touched, so candidates reappear instantly).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expire_old_sos()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sos_requests SET status = 'expired'
   WHERE status = 'active' AND coalesce(play_until, play_at) < now();
$$;

-- Bring back games the old cron killed mid-window (still-running windows only)
UPDATE public.sos_requests
   SET status = 'active'
 WHERE status = 'expired'
   AND play_until IS NOT NULL
   AND play_until > now();

NOTIFY pgrst, 'reload schema';
