-- ═══════════════════════════════════════════════════════════════════
-- AUDIT FIXES 2026-07-20 · batch 2
--  1) flare_my_game / widen_my_game — June-19 hardening revoked direct UPDATE
--     on sos_requests; these owner-only RPCs restore the manual-flare and
--     widen-levels buttons that silently broke.
--  2) my_invite_uses — client (GetStarted) calls it; existed in no migration.
--  3) notify hardening — shared secret in Vault; _push_users v3 stamps it as
--     x-notify-secret so the edge fns can refuse anonymous (anon-key) senders.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.flare_my_game(_sos_id uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  IF _sos.caller_id <> _uid THEN RETURN QUERY SELECT false, 'not_owner'::text; RETURN; END IF;
  IF _sos.status <> 'active' THEN RETURN QUERY SELECT false, 'not_active'::text; RETURN; END IF;
  IF _sos.kind <> 'open' THEN RETURN QUERY SELECT false, 'already_sos'::text; RETURN; END IF;
  IF coalesce(_sos.play_until, _sos.play_at) < now() THEN RETURN QUERY SELECT false, 'expired'::text; RETURN; END IF;
  UPDATE public.sos_requests SET kind = 'sos', flared_at = now() WHERE id = _sos_id;
  RETURN QUERY SELECT true, 'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.flare_my_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flare_my_game(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.widen_my_game(_sos_id uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sos public.sos_requests;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false, 'not_authenticated'::text; RETURN; END IF;
  SELECT * INTO _sos FROM public.sos_requests WHERE id = _sos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  IF _sos.caller_id <> _uid THEN RETURN QUERY SELECT false, 'not_owner'::text; RETURN; END IF;
  IF _sos.status <> 'active' THEN RETURN QUERY SELECT false, 'not_active'::text; RETURN; END IF;
  UPDATE public.sos_requests SET level_min = 1, level_max = 5, flared_at = now() WHERE id = _sos_id;
  RETURN QUERY SELECT true, 'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.widen_my_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.widen_my_game(uuid) TO authenticated;

-- "How many people joined via my invite" — referrals_count is the canonical
-- counter (maintained by the _buddy_on_signup trigger). DROP first: if Lovable
-- ever hand-created a variant with another return type, REPLACE would fail.
DROP FUNCTION IF EXISTS public.my_invite_uses();
CREATE FUNCTION public.my_invite_uses()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT referrals_count FROM public.profiles WHERE id = auth.uid()), 0);
$$;
REVOKE ALL ON FUNCTION public.my_invite_uses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_invite_uses() TO authenticated;

-- ── notify hardening: shared secret lives in Vault ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    BEGIN CREATE EXTENSION supabase_vault; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault')
     AND NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_secret') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'notify_secret');
  END IF;
END $$;

-- _push_users v3: same dual-channel as v2, now stamps x-notify-secret (from
-- Vault) on both calls so notify-users / email-notify can refuse anonymous
-- callers once NOTIFY_SECRET is also set in Edge secrets.
create or replace function public._push_users(_ids uuid[], _title text, _body text, _url text, _tag text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare _secret text; _hdrs jsonb;
begin
  if _ids is null or array_length(_ids, 1) is null then return; end if;
  begin
    select decrypted_secret into _secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  exception when others then _secret := null; end;
  _hdrs := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
  ) || case when _secret is not null then jsonb_build_object('x-notify-secret', _secret) else '{}'::jsonb end;
  begin
    perform net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/notify-users',
      headers := _hdrs,
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag)
    );
  exception when others then null; end;
  begin
    perform net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/email-notify',
      headers := _hdrs,
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag)
    );
  exception when others then null; end;
end;
$$;

NOTIFY pgrst, 'reload schema';
