create extension if not exists pg_net;

create or replace function public.notify_host_on_claim()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _claimer text;
  _court text;
begin
  if new.status = 'claimed'
     and old.status is distinct from 'claimed'
     and new.claimed_by is not null then
    begin
      select name into _claimer from public.profiles where id = new.claimed_by;
      select name into _court   from public.courts   where id = new.court_id;
      perform net.http_post(
        url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/notify-users',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
        ),
        body := jsonb_build_object(
          'user_ids', jsonb_build_array(new.caller_id),
          'title', '🎾 ' || coalesce(_claimer, 'Someone') || ' grabbed your game!',
          'body', coalesce(_court, 'Your game') || ' — tap to see it and say hi.',
          'url', '/matches',
          'tag', 'claim-' || new.id::text
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
create trigger trg_notify_host_on_claim
  after update of status on public.sos_requests
  for each row execute function public.notify_host_on_claim();