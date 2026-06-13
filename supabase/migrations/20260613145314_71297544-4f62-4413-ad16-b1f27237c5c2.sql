CREATE OR REPLACE FUNCTION public.ensure_my_invite_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _code text; _name text; _base text; _try int := 0;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT code INTO _code FROM public.invite_codes WHERE owner_id = _uid LIMIT 1;
  IF _code IS NOT NULL THEN RETURN _code; END IF;
  SELECT name INTO _name FROM public.profiles WHERE id = _uid;
  _base := upper(regexp_replace(coalesce(split_part(_name,' ',1),'PLAYER'),'[^a-zA-Z]','','g'));
  IF length(_base) = 0 THEN _base := 'PLAYER'; END IF;
  _base := left(_base, 8);
  LOOP
    _code := _base || '-' || upper(substr(md5(random()::text), 1, 3));
    BEGIN
      INSERT INTO public.invite_codes (code, uses_remaining, active, owner_id)
      VALUES (_code, 50, true, _uid);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      _try := _try + 1; IF _try > 10 THEN RETURN NULL; END IF;
    END;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION public.ensure_my_invite_code() TO authenticated;