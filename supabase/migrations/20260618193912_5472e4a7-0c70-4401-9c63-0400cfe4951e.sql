-- 1) PROFILES: restrict SELECT to own row; expose safe columns via view
DROP POLICY IF EXISTS "profiles visible to authenticated" ON public.profiles;
CREATE POLICY "users select own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- Recreate profiles_public as security_definer so authenticated users can
-- read the safe columns of OTHER users without the broad table policy.
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public WITH (security_invoker = false) AS
  SELECT id, name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, created_at
    FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;

-- 2) PROFILES: prevent self-privilege-escalation (is_admin, signup_code)
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  IF NEW.signup_code IS DISTINCT FROM OLD.signup_code THEN
    NEW.signup_code := OLD.signup_code;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 3) INVITE_CODES: remove public read; restrict to authenticated
DROP POLICY IF EXISTS "anyone can read invite codes" ON public.invite_codes;
CREATE POLICY "authenticated read invite codes" ON public.invite_codes
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.invite_codes FROM anon;

-- 4) Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.set_spots_needed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.spots_needed := CASE NEW.format::text
    WHEN 'doubles_need3' THEN 3 WHEN 'doubles_need2' THEN 2 ELSE 1 END;
  RETURN NEW;
END; $$;

-- 5) Revoke implicit PUBLIC/anon execute on public SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Re-grant authenticated EXECUTE on the user-callable RPCs
GRANT EXECUTE ON FUNCTION public.claim_sos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_game(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_game(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_noshow(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_buddy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_buddy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_buddy_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_my_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_sos_for_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_open_games_for_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.top_rescuers_month() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_matching_rescuers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_sos_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_buddy(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_courts_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_court(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_court_hidden(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_invite_active(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_invite_code(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_due_open_games() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_sos() TO authenticated;