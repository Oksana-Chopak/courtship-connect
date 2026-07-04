create extension if not exists pg_net;

create or replace function public.notify_host_on_join()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare _claimer text; _court text; _left int;
begin
  if new.spots_filled > coalesce(old.spots_filled, 0)
     and new.claimed_by is not null then
    begin
      select name into _claimer from public.profiles where id = new.claimed_by;
      select name into _court   from public.courts   where id = new.court_id;
      _left := greatest(0, coalesce(new.spots_needed, 1) - new.spots_filled);
      perform net.http_post(
        url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/notify-users',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
        ),
        body := jsonb_build_object(
          'user_ids', jsonb_build_array(new.caller_id),
          'title', '🎾 ' || coalesce(_claimer, 'Someone') || ' joined your game!',
          'body', case when _left > 0
                    then _left::text || ' more to fill — tap to see who''s in.'
                    else coalesce(_court, 'Your game') || ' — tap to say hi.' end,
          'url', '/matches',
          'tag', 'join-' || new.id::text || '-' || new.spots_filled::text
        )
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_host_on_claim on public.sos_requests;
drop trigger if exists trg_notify_host_on_join  on public.sos_requests;
create trigger trg_notify_host_on_join
  after update of spots_filled on public.sos_requests
  for each row execute function public.notify_host_on_join();