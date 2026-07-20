-- 1) Точковий (re)grant лише безпечних функцій
DO $$
DECLARE _fn text;
BEGIN
  FOR _fn IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('players_directory','kudos_for','kudos_by','give_kudos',
                        'community_stats','founders_wall')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _fn);
  END LOOP;
END $$;

-- 2) players_directory closed to anon
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.players_directory(uuid[]) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 3) Close sos_push_targets back to service_role only
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.sos_push_targets(uuid) FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.sos_push_targets(uuid) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';