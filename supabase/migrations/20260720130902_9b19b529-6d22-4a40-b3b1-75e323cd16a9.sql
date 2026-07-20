CREATE TABLE IF NOT EXISTS public.internal_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_config FROM PUBLIC, anon, authenticated;

INSERT INTO public.internal_config (key, value)
VALUES ('notify_secret', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;

create or replace function public._push_users(_ids uuid[], _title text, _body text, _url text, _tag text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare _secret text; _hdrs jsonb;
begin
  if _ids is null or array_length(_ids, 1) is null then return; end if;
  begin
    select value into _secret from public.internal_config where key = 'notify_secret' limit 1;
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