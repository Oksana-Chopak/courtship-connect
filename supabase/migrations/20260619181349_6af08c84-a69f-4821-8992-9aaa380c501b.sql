
-- 1) Ensure profiles_public view is gone (replaced by players_directory RPC)
DROP VIEW IF EXISTS public.profiles_public CASCADE;

-- 2) Profiles: own-row only direct SELECT; cross-user via players_directory RPC
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles visible to authenticated" ON public.profiles;
DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Make sure players_directory is reachable by authenticated only (not anon)
REVOKE EXECUTE ON FUNCTION public.players_directory(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.players_directory(uuid[]) TO authenticated;

-- 3) event_requests: force status=pending on insert; revoke anon
REVOKE ALL ON public.event_requests FROM anon;

DROP POLICY IF EXISTS event_requests_insert ON public.event_requests;
CREATE POLICY event_requests_insert ON public.event_requests
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid() AND status = 'pending');

-- 4) event_attendees: inserts only via join_event RPC
REVOKE INSERT ON public.event_attendees FROM authenticated, anon;
DROP POLICY IF EXISTS event_attendees_insert ON public.event_attendees;

-- 5) Avatars storage: read only own folder (first path segment = uid)
DROP POLICY IF EXISTS "avatars readable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "avatars read own folder" ON storage.objects;
DROP POLICY IF EXISTS "avatars insert own folder" ON storage.objects;
DROP POLICY IF EXISTS "avatars update own folder" ON storage.objects;
DROP POLICY IF EXISTS "avatars delete own folder" ON storage.objects;

CREATE POLICY "avatars read own folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 6) Invite code limit enforcement (idempotent re-assert)
CREATE OR REPLACE FUNCTION public.enforce_invite_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN RETURN NEW; END IF;
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  _code := upper(trim(COALESCE(NEW.signup_code,
                               (auth.jwt() -> 'user_metadata' ->> 'signup_code'))));
  IF _code IS NULL OR _code = '' THEN RAISE EXCEPTION 'invite_required'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.invite_codes
                  WHERE code = _code AND active = true AND uses_remaining > 0) INTO _ok;
  IF NOT _ok THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  UPDATE public.invite_codes SET uses_remaining = GREATEST(0, uses_remaining - 1) WHERE code = _code;
  NEW.signup_code := _code;
  RETURN NEW;
END $$;
