CREATE OR REPLACE FUNCTION public.enforce_invite_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _valid boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN RETURN NEW; END IF;
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;

  _code := upper(trim(COALESCE(NEW.signup_code,
                               (auth.jwt() -> 'user_metadata' ->> 'signup_code'))));

  -- Open beta (2026-08-06): no code, no problem.
  IF _code IS NULL OR _code = '' THEN
    NEW.signup_code := NULL;
    RETURN NEW;
  END IF;

  -- A code that checks out is kept for attribution; an unknown one is
  -- dropped silently — never block the door over a stale link.
  SELECT EXISTS (SELECT 1 FROM public.invite_codes WHERE code = _code) INTO _valid;
  NEW.signup_code := CASE WHEN _valid THEN _code ELSE NULL END;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.enforce_invite_on_profile_insert() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enforce_invite_on_profile_insert() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';