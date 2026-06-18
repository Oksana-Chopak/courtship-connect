CREATE OR REPLACE FUNCTION public.set_my_invite_code(_new text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _clean text; _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  _clean := upper(regexp_replace(trim(_new), '[^A-Za-z0-9-]', '', 'g'));
  IF length(_clean) < 3 THEN RAISE EXCEPTION 'too_short'; END IF;
  IF EXISTS (SELECT 1 FROM public.invite_codes WHERE code = _clean AND owner_id IS DISTINCT FROM _uid) THEN
    RAISE EXCEPTION 'taken';
  END IF;
  SELECT code INTO _existing FROM public.invite_codes
   WHERE owner_id = _uid AND active = true ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    UPDATE public.invite_codes SET code = _clean WHERE code = _existing;
    UPDATE public.profiles SET signup_code = _clean WHERE upper(COALESCE(signup_code,'')) = _existing;
  ELSE
    INSERT INTO public.invite_codes (code, uses_remaining, active, owner_id)
    VALUES (_clean, 50, true, _uid);
  END IF;
  RETURN _clean;
END $$;

GRANT EXECUTE ON FUNCTION public.set_my_invite_code(text) TO authenticated;