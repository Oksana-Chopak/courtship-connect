-- Courtship · event sign-ups leave a trace: every join and every cancel is logged,
-- and the organizer is told when someone cancels (which session, in her language).
-- 2026-10-17. Idempotent. Lovable → More → Cloud → SQL editor → Run. Last SELECT: four × true.

-- 1 · Append-only history of sign-ups (only the organizer and admins can read it)
create table if not exists public.event_attendance_log (
  id       bigserial primary key,
  event_id uuid not null,
  user_id  uuid,
  action   text not null check (action in ('joined', 'left')),
  status   text,
  at       timestamptz not null default now()
);
create index if not exists event_attendance_log_event_at on public.event_attendance_log (event_id, at);
alter table public.event_attendance_log enable row level security;
revoke all on public.event_attendance_log from anon, authenticated;
grant select on public.event_attendance_log to authenticated;
drop policy if exists event_log_host_select on public.event_attendance_log;
create policy event_log_host_select on public.event_attendance_log for select to authenticated
  using (exists (select 1 from public.event_requests e where e.id = event_id and e.host_id = auth.uid())
         or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin));

create or replace function public._log_event_attendance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.event_attendance_log (event_id, user_id, action, status) values (new.event_id, new.user_id, 'joined', new.status);
    return new;
  end if;
  insert into public.event_attendance_log (event_id, user_id, action, status) values (old.event_id, old.user_id, 'left', old.status);
  return old;
end $$;
revoke all on function public._log_event_attendance() from public, anon, authenticated;

drop trigger if exists trg_log_event_attendance on public.event_attendees;
create trigger trg_log_event_attendance
  after insert or delete on public.event_attendees
  for each row execute function public._log_event_attendance();

-- 2 · "X cancelled": the organizer hears it, with the session's date (silent when
--     the whole event was deleted — then there is no session to talk about)
create or replace function public.notify_host_on_event_leave()
returns trigger language plpgsql security definer set search_path = public as $$
declare _host uuid; _title text; _starts timestamptz; _city text; _price int;
        _who text; _lang text; _when text; _t text; _b text;
begin
  select host_id, title, starts_at, city, price_sek into _host, _title, _starts, _city, _price
    from public.event_requests where id = old.event_id;
  if _host is null or _host = old.user_id or _starts < now() then return old; end if;
  select name into _who from public.profiles where id = old.user_id;
  select coalesce(lang, 'en') into _lang from public.profiles where id = _host;
  _when := public._court_when(_starts, _city, _lang);
  if _lang = 'sv' then
    _t := '↩️ ' || coalesce(_who, 'En spelare') || ' avbokade: ' || coalesce(_title, 'ditt event') || ' · ' || _when;
    _b := _when || coalesce(' · ' || nullif(_city, ''), '')
          || case when old.status = 'paid' then ' · hade betalat ' || coalesce(_price, 0) || ' kr' else '' end
          || '. Platsen är ledig igen.';
  else
    _t := '↩️ ' || coalesce(_who, 'A player') || ' cancelled: ' || coalesce(_title, 'your event') || ' · ' || _when;
    _b := _when || coalesce(' · ' || nullif(_city, ''), '')
          || case when old.status = 'paid' then ' · had paid ' || coalesce(_price, 0) || ' kr' else '' end
          || '. The spot is free again.';
  end if;
  perform public._push_users(array[_host], _t, _b, '/board?focus_event=' || old.event_id::text,
                             'evleave-' || old.event_id::text || '-' || coalesce(old.user_id::text, ''));
  return old;
end $$;
revoke all on function public.notify_host_on_event_leave() from public, anon, authenticated;

drop trigger if exists trg_notify_host_on_event_leave on public.event_attendees;
create trigger trg_notify_host_on_event_leave
  after delete on public.event_attendees
  for each row execute function public.notify_host_on_event_leave();

NOTIFY pgrst, 'reload schema';

-- VERIFY — four × true
SELECT
  to_regclass('public.event_attendance_log') IS NOT NULL                                                   AS history_table,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_log_event_attendance' AND NOT tgisinternal)         AS history_trigger,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_host_on_event_leave' AND NOT tgisinternal)   AS cancel_message_trigger,
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_attendance_log' AND policyname = 'event_log_host_select') AS only_host_reads;
