CREATE OR REPLACE FUNCTION public.admin_user_emails()
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
         u.email::text,
         p.name,
         u.created_at,
         u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.is_admin = true
  )
  ORDER BY u.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_user_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_emails() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_user_emails() TO authenticated;