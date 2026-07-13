CREATE OR REPLACE FUNCTION public.weekly_recap_push()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _n int := 0; _wk_start timestamptz; _title text; _body text;
BEGIN
  _wk_start := date_trunc('week', now() AT TIME ZONE 'Europe/Stockholm') - interval '7 days';
  FOR _r IN
    WITH last_week AS (
      SELECT p.id,
             count(g.id) FILTER (
               WHERE (g.played_at AT TIME ZONE 'Europe/Stockholm') >= _wk_start
                 AND (g.played_at AT TIME ZONE 'Europe/Stockholm') <  _wk_start + interval '7 days'
                 AND g.confirmed_a AND g.confirmed_b
             ) AS games_last_week
      FROM public.profiles p
      LEFT JOIN public.games g
        ON (g.player_a = p.id OR g.player_b = p.id)
      GROUP BY p.id
    )
    SELECT id, games_last_week FROM last_week WHERE games_last_week > 0
  LOOP
    _title := '📈 Your week on court';
    _body := CASE
      WHEN _r.games_last_week = 1 THEN 'You played 1 game last week. Your season keeps growing — see where you stand 🎾'
      ELSE 'You played ' || _r.games_last_week || ' games last week. Your season keeps growing — see where you stand 🎾'
    END;
    PERFORM public._push_users(ARRAY[_r.id], _title, _body, '/progress', 'recap-' || to_char(now(), 'IYYY-IW'));
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END; $$;

DO $$ BEGIN
  PERFORM cron.unschedule('weekly-recap');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'weekly-recap',
  '0 6 * * 1',
  $cron$ SELECT public.weekly_recap_push(); $cron$
);