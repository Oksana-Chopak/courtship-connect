CREATE OR REPLACE FUNCTION public.check_invite_code(_code text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invite_codes
     WHERE code = upper(trim(_code))
       AND active = true
       AND uses_remaining > 0
  );
$$;

REVOKE ALL ON FUNCTION public.check_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_invite_code(text) TO anon, authenticated;