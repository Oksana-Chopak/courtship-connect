ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifs boolean NOT NULL DEFAULT true;

create or replace function public._push_users(_ids uuid[], _title text, _body text, _url text, _tag text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if _ids is null or array_length(_ids, 1) is null then return; end if;
  begin
    perform net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/notify-users',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
      ),
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag)
    );
  exception when others then null; end;
  begin
    perform net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/email-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
      ),
      body := jsonb_build_object('user_ids', to_jsonb(_ids), 'title', _title, 'body', _body, 'url', _url, 'tag', _tag)
    );
  exception when others then null; end;
end;
$$;

create or replace function public.request_buddy(_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _name text;
begin
  if _me is null then raise exception 'not_authenticated'; end if;
  if _me = _other then raise exception 'cannot_buddy_self'; end if;
  if public.is_buddy(_me, _other) then return; end if;
  insert into public.buddy_requests (from_id, to_id) values (_me, _other)
  on conflict (from_id, to_id) do update set status = 'pending', created_at = now();
  select name into _name from public.profiles where id = _me;
  perform public._push_users(
    array[_other],
    '🤗 ' || coalesce(_name, 'A player') || ' wants to be your court buddy',
    'Accept and you can ping each other for games anytime.',
    '/players', 'buddyreq-' || _me::text);
end; $$;
GRANT EXECUTE ON FUNCTION public.request_buddy(uuid) TO authenticated;

create or replace function public.respond_buddy_request(_req_id uuid, _accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid(); _r public.buddy_requests; _name text;
begin
  select * into _r from public.buddy_requests where id = _req_id for update;
  if not found or _r.to_id <> _me then raise exception 'not_found'; end if;
  if _accept then
    perform public._add_buddy(_r.from_id, _r.to_id, 'manual');
    update public.buddy_requests set status = 'accepted' where id = _req_id;
    select name into _name from public.profiles where id = _me;
    perform public._push_users(
      array[_r.from_id],
      '🎾 ' || coalesce(_name, 'Your invite') || ' accepted — you''re court buddies!',
      'Ping them for a game whenever you''re free.',
      '/players', 'buddyok-' || _req_id::text);
  else
    update public.buddy_requests set status = 'declined' where id = _req_id;
  end if;
end; $$;
GRANT EXECUTE ON FUNCTION public.respond_buddy_request(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';