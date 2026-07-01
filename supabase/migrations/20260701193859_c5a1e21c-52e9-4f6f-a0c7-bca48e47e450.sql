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
      body := jsonb_build_object(
        'user_ids', to_jsonb(_ids),
        'title', _title,
        'body', _body,
        'url', _url,
        'tag', _tag
      )
    );
  exception when others then
    null;
  end;
end;
$$;

create or replace function public.notify_on_buddy_request()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare _from text;
begin
  if new.status = 'pending' then
    select name into _from from public.profiles where id = new.from_id;
    perform public._push_users(
      array[new.to_id],
      '🎾 ' || coalesce(_from, 'A player') || ' wants to play!',
      'Tap to accept your new tennis buddy.',
      '/people',
      'buddyreq-' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_buddy_request on public.buddy_requests;
create trigger trg_notify_on_buddy_request
  after insert on public.buddy_requests
  for each row execute function public.notify_on_buddy_request();

create or replace function public.notify_host_on_event_join()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare _host uuid; _title text; _joiner text;
begin
  select host_id, title into _host, _title from public.event_requests where id = new.event_id;
  if _host is not null and _host <> new.user_id then
    select name into _joiner from public.profiles where id = new.user_id;
    perform public._push_users(
      array[_host],
      '🎾 ' || coalesce(_joiner, 'Someone') || ' joined your event!',
      coalesce(_title, 'Your event') || ' — tap to see who''s coming.',
      '/board',
      'evjoin-' || new.event_id::text || '-' || new.user_id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_host_on_event_join on public.event_attendees;
create trigger trg_notify_host_on_event_join
  after insert on public.event_attendees
  for each row execute function public.notify_host_on_event_join();

create or replace function public._buddy_on_signup()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare _owner uuid;
begin
  if new.signup_code is null then return new; end if;
  select owner_id into _owner from public.invite_codes where code = upper(new.signup_code);
  if _owner is not null and _owner <> new.id then
    perform public._add_buddy(_owner, new.id, 'invite');
    update public.profiles set referrals_count = referrals_count + 1 where id = _owner;
    perform public._push_users(
      array[_owner],
      '🎾 ' || coalesce(new.name, 'A new player') || ' joined with your invite!',
      'You''re now tennis buddies — say hi!',
      '/people',
      'invjoin-' || new.id::text
    );
  end if;
  return new;
end;
$$;