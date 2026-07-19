GRANT EXECUTE ON FUNCTION public.check_invite_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_contact_phone(_target uuid)
RETURNS TABLE(phone text, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := auth.uid(); _p text; _n text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _me = _target
     OR public.is_buddy(_me, _target)
     OR EXISTS (
       SELECT 1 FROM public.games g
        WHERE (g.player_a = _me AND g.player_b = _target)
           OR (g.player_a = _target AND g.player_b = _me)
     ) THEN
    SELECT p.phone_e164, p.name INTO _p, _n FROM public.profiles p WHERE p.id = _target;
    IF _p IS NULL OR btrim(_p) = '' THEN RAISE EXCEPTION 'no_number'; END IF;
    RETURN QUERY SELECT _p, _n;
    RETURN;
  END IF;
  RAISE EXCEPTION 'forbidden';
END $$;
REVOKE ALL ON FUNCTION public.get_contact_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_phone(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';