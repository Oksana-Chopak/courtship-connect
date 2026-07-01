create extension if not exists pg_net;

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
  exception when others then
    null;
  end;
end;
$$;

alter table public.profiles add column if not exists events_optin boolean not null default true;

drop function if exists public.save_push_prefs(int, boolean, int, boolean);

create or replace function public.save_push_prefs(
  _radius int, _sos_optin boolean, _max_per_week int, _wake_me boolean, _events_optin boolean default null
) returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'not_authenticated'; end if;
  update public.profiles set
    buddy_radius_km   = least(100, greatest(1, coalesce(_radius, buddy_radius_km))),
    buddy_sos_optin   = coalesce(_sos_optin, buddy_sos_optin),
    push_max_per_week = least(50, greatest(1, coalesce(_max_per_week, push_max_per_week))),
    push_wake_me      = coalesce(_wake_me, push_wake_me),
    events_optin      = coalesce(_events_optin, events_optin)
  where id = _uid;
end $$;

grant execute on function public.save_push_prefs(int, boolean, int, boolean, boolean) to authenticated;

create or replace function public.notify_on_event_approved()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare _ids uuid[];
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select coalesce(array_agg(p.id), '{}') into _ids
    from public.profiles p
    where p.events_optin
      and p.id <> new.host_id
      and p.home_city is not distinct from new.city;
    perform public._push_users(
      _ids,
      '🎾 New event' || coalesce(' in ' || new.city, '') || '!',
      coalesce(new.title, 'A new event') || ' — tap to join.',
      '/board',
      'event-' || new.id::text
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_on_event_approved on public.event_requests;
create trigger trg_notify_on_event_approved
  after insert or update of status on public.event_requests
  for each row execute function public.notify_on_event_approved();