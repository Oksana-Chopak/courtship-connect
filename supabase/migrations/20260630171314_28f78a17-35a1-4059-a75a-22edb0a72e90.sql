create extension if not exists pg_net;

create or replace function public.notify_on_flare()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'active'
     and new.kind = 'sos'
     and new.flared_at is not null
     and new.flared_at is distinct from old.flared_at then
    perform net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/sos-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
      ),
      body := jsonb_build_object('sos_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_flare on public.sos_requests;
create trigger trg_notify_on_flare
  after update of flared_at on public.sos_requests
  for each row execute function public.notify_on_flare();