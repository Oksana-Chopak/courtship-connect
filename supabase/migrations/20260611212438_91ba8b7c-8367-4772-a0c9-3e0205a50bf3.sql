
REVOKE EXECUTE ON FUNCTION public.claim_sos(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.active_sos_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expire_old_sos() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.count_matching_rescuers(uuid) FROM PUBLIC, anon;
