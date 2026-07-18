-- 1) Schema + tables + sequences
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 2) Functions: signed-in users may execute; anon gets nothing by default
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 3) Curated anon (guest peek) functions
GRANT EXECUTE ON FUNCTION public.public_board() TO anon;
GRANT EXECUTE ON FUNCTION public.public_players(int) TO anon;

-- 4) Defaults for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- 5) Explicit re-lock of sensitive functions from anon
REVOKE EXECUTE ON FUNCTION public.players_directory(uuid[]) FROM anon;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.admin_user_emails() FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
