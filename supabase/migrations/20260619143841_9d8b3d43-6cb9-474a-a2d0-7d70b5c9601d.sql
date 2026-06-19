
-- 1) invite_codes: restrict SELECT to admins only
DROP POLICY IF EXISTS "authenticated read invite codes" ON public.invite_codes;
DROP POLICY IF EXISTS "admins read invite codes" ON public.invite_codes;
CREATE POLICY "admins read invite codes" ON public.invite_codes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- 2) Enforce invite code at profile INSERT (server-side gate)
CREATE OR REPLACE FUNCTION public.enforce_invite_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _valid boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Service role / admin bypass (e.g. backfills)
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  _code := upper(trim(COALESCE(
    NEW.signup_code,
    (auth.jwt() -> 'user_metadata' ->> 'signup_code')
  )));
  IF _code IS NULL OR _code = '' THEN
    RAISE EXCEPTION 'invite_required';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.invite_codes
     WHERE code = _code AND active = true AND uses_remaining > 0
  ) INTO _valid;
  IF NOT _valid THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;
  UPDATE public.invite_codes
     SET uses_remaining = GREATEST(0, uses_remaining - 1)
   WHERE code = _code;
  NEW.signup_code := _code;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_enforce_invite ON public.profiles;
CREATE TRIGGER profiles_enforce_invite
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_on_profile_insert();

-- 3) games: block direct UPDATEs; route through existing SECURITY DEFINER RPCs
DROP POLICY IF EXISTS "games update by participants" ON public.games;
REVOKE UPDATE ON public.games FROM authenticated;

-- 4) buddy_requests: revoke direct write access (request_buddy / respond_buddy_request RPCs handle it)
REVOKE INSERT, UPDATE, DELETE ON public.buddy_requests FROM authenticated;

-- 5) sos_requests: block direct UPDATEs and add cancel_sos RPC
DROP POLICY IF EXISTS "sos update own or claim" ON public.sos_requests;
REVOKE UPDATE ON public.sos_requests FROM authenticated;

CREATE OR REPLACE FUNCTION public.cancel_sos(_sos_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.sos_requests
     SET status = 'cancelled'
   WHERE id = _sos_id AND caller_id = _uid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found_or_not_owner'; END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_sos(uuid) TO authenticated;
