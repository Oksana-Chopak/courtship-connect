
ALTER VIEW public.profiles_public SET (security_invoker = true);
DROP FUNCTION IF EXISTS public.get_whatsapp_phone(uuid);
