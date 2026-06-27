CREATE OR REPLACE FUNCTION public.enforce_invite_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _valid boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN RETURN NEW; END IF;
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  _code := upper(trim(COALESCE(NEW.signup_code,
                               (auth.jwt() -> 'user_metadata' ->> 'signup_code'))));
  IF _code IS NULL OR _code = '' THEN RAISE EXCEPTION 'invite_required'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.invite_codes WHERE code = _code) INTO _valid;
  IF NOT _valid THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  NEW.signup_code := _code;
  RETURN NEW;
END $$;