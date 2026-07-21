DROP FUNCTION IF EXISTS public.public_board();
DROP FUNCTION IF EXISTS public.public_players(int);
DROP FUNCTION IF EXISTS public.top_active_month();
DROP FUNCTION IF EXISTS public.top_hosts_month();

alter table public.profiles
  add column if not exists accepted_terms_at timestamptz,
  add column if not exists accepted_terms_version text,
  add column if not exists confirmed_adult boolean not null default false,
  add column if not exists public_preview boolean not null default true;

create or replace function public.accept_terms(_version text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(_version), '') = '' or length(_version) > 20 then
    raise exception 'bad version';
  end if;
  update public.profiles
     set accepted_terms_at = now(),
         accepted_terms_version = _version,
         confirmed_adult = true
   where id = auth.uid();
end $$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

create or replace function public.public_players(_limit int default 30)
returns table(
  id uuid, name text, photo_url text, level int, vibe text,
  home_city text, rescues_count int, games_played int
)
language sql stable security definer set search_path = public as $$
  select id, name, photo_url, level, vibe::text,
         home_city, rescues_count, games_played
    from public.profiles
   where coalesce(name, '') <> ''
     and public_preview
   order by created_at desc
   limit greatest(1, least(_limit, 50));
$$;
revoke all on function public.public_players(int) from public;
grant execute on function public.public_players(int) to anon, authenticated;

create or replace function public.public_board()
returns table(
  id uuid, kind text, play_at timestamptz, created_at timestamptz,
  format text, level_min int, level_max int,
  spots_needed int, spots_filled int,
  court_name text, court_city text, court_type text, court_status text,
  caller_id uuid, caller_name text, caller_photo text, sport text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind::text, s.play_at, s.created_at,
         s.format::text, s.level_min, s.level_max,
         s.spots_needed, s.spots_filled,
         c.name, c.city, s.court_type::text, s.court_status::text,
         p.id, p.name, p.photo_url, s.sport
    from public.sos_requests s
    join public.courts c on c.id = s.court_id
    join public.profiles p on p.id = s.caller_id
   where s.status = 'active'
     and s.play_at > now()
     and p.public_preview
   order by s.play_at asc
   limit 50;
$$;
revoke all on function public.public_board() from public;
grant execute on function public.public_board() to anon, authenticated;

create or replace function public.top_active_month()
returns table(user_id uuid, name text, n int)
language sql security definer set search_path = public as $$
  select x.pl as user_id, p.name, count(*)::int as n
  from (
    select player_a as pl from public.games
      where played_at >= date_trunc('month', now()) and played_at < date_trunc('month', now()) + interval '1 month'
    union all
    select player_b as pl from public.games
      where played_at >= date_trunc('month', now()) and played_at < date_trunc('month', now()) + interval '1 month'
  ) x
  join public.profiles p on p.id = x.pl
  where p.public_preview
  group by x.pl, p.name
  order by n desc, p.name
  limit 5;
$$;

create or replace function public.top_rescuers_month()
returns table(user_id uuid, name text, rescues int)
language sql security definer set search_path = public as $$
  select g.player_b as user_id, p.name, count(*)::int as rescues
  from public.games g
  join public.profiles p on p.id = g.player_b
  where g.played_at >= date_trunc('month', now())
    and g.played_at <  date_trunc('month', now()) + interval '1 month'
    and p.public_preview
  group by g.player_b, p.name
  order by rescues desc, p.name
  limit 5;
$$;

create or replace function public.top_hosts_month()
returns table(user_id uuid, name text, n int)
language sql security definer set search_path = public as $$
  select sr.caller_id as user_id, p.name, count(*)::int as n
  from public.sos_requests sr
  join public.profiles p on p.id = sr.caller_id
  where sr.kind = 'open'
    and sr.play_at >= date_trunc('month', now())
    and sr.play_at < date_trunc('month', now()) + interval '1 month'
    and p.public_preview
  group by sr.caller_id, p.name
  order by n desc, p.name
  limit 5;
$$;

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('illegal', 'harassment', 'fake', 'inappropriate', 'other')),
  details text check (details is null or length(details) <= 1000),
  status text not null default 'new' check (status in ('new', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);
alter table public.user_reports enable row level security;
grant all on public.user_reports to service_role;

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 200),
  purchase text not null check (length(purchase) between 1 and 300),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'new' check (status in ('new', 'refunded', 'rejected', 'invalid')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.withdrawal_requests enable row level security;
grant all on public.withdrawal_requests to service_role;

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select email into _email from auth.users where id = _uid;

  begin
    delete from storage.objects
     where bucket_id = 'avatars'
       and (name = _uid::text or name like _uid::text || '/%');
  exception when others then null;
  end;

  update public.sos_requests set claimed_by = null where claimed_by = _uid;
  update public.games set reported_noshow = null where reported_noshow = _uid;
  update public.announcements set created_by = null where created_by = _uid;

  if _email is not null then
    delete from public.email_send_log where recipient_email = _email;
    delete from public.email_unsubscribe_tokens where email = _email;
  end if;

  delete from auth.users where id = _uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

create or replace function public.export_my_data()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _out jsonb;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select email into _email from auth.users where id = _uid;

  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', _uid, 'email', _email),
    'profile', (select to_jsonb(p) - 'is_admin' from public.profiles p where p.id = _uid),
    'games', coalesce((select jsonb_agg(to_jsonb(g)) from public.games g
                        where g.player_a = _uid or g.player_b = _uid), '[]'::jsonb),
    'sos_requests', coalesce((select jsonb_agg(to_jsonb(s) - 'ghost_claim_token' - 'invite_join_token')
                        from public.sos_requests s where s.caller_id = _uid), '[]'::jsonb),
    'sos_applications', coalesce((select jsonb_agg(to_jsonb(a)) from public.sos_applications a
                        where a.applicant_id = _uid), '[]'::jsonb),
    'swipes_made', coalesce((select jsonb_agg(to_jsonb(w)) from public.swipes w
                        where w.liker_id = _uid), '[]'::jsonb),
    'buddies', coalesce((select jsonb_agg(to_jsonb(b)) from public.buddies b
                        where b.user_low = _uid or b.user_high = _uid), '[]'::jsonb),
    'buddy_requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.buddy_requests r
                        where r.from_id = _uid or r.to_id = _uid), '[]'::jsonb),
    'kudos', coalesce((select jsonb_agg(to_jsonb(k)) from public.kudos k
                        where k.from_id = _uid or k.to_id = _uid), '[]'::jsonb),
    'event_signups', coalesce((select jsonb_agg(to_jsonb(e)) from public.event_attendees e
                        where e.user_id = _uid), '[]'::jsonb),
    'events_hosted', coalesce((select jsonb_agg(to_jsonb(ev)) from public.event_requests ev
                        where ev.host_id = _uid), '[]'::jsonb),
    'coach_requests', coalesce((select jsonb_agg(to_jsonb(c)) from public.coach_requests c
                        where c.user_id = _uid), '[]'::jsonb),
    'push_subscriptions', coalesce((select jsonb_agg(to_jsonb(ps) - 'p256dh' - 'auth')
                        from public.push_subscriptions ps where ps.user_id = _uid), '[]'::jsonb),
    'notifications_log', coalesce((select jsonb_agg(to_jsonb(pe)) from public.push_events pe
                        where pe.user_id = _uid), '[]'::jsonb),
    'emails_sent_log', coalesce((select jsonb_agg(to_jsonb(el)) from public.email_send_log el
                        where el.recipient_email = _email), '[]'::jsonb),
    'reports_made', coalesce((select jsonb_agg(to_jsonb(ur) - 'reporter_id') from public.user_reports ur
                        where ur.reporter_id = _uid), '[]'::jsonb),
    'withdrawal_requests', coalesce((select jsonb_agg(to_jsonb(wr)) from public.withdrawal_requests wr
                        where wr.user_id = _uid), '[]'::jsonb)
  ) into _out;
  return _out;
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

create or replace function public.report_user(_target uuid, _reason text, _details text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if _target = _uid then raise exception 'cannot report yourself'; end if;
  if not exists (select 1 from public.profiles where id = _target) then
    raise exception 'no such player';
  end if;
  if (select count(*) from public.user_reports
       where reporter_id = _uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'report limit reached — email us instead';
  end if;
  insert into public.user_reports (reporter_id, target_id, reason, details)
  values (_uid, _target, _reason, nullif(trim(coalesce(_details, '')), ''));
end $$;
revoke all on function public.report_user(uuid, text, text) from public, anon;
grant execute on function public.report_user(uuid, text, text) to authenticated;

create or replace function public.admin_list_reports()
returns table(
  id uuid, created_at timestamptz, status text, reason text, details text,
  reporter_name text, target_id uuid, target_name text, resolved_at timestamptz, resolution_note text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.created_at, r.status, r.reason, r.details,
         rp.name || ' ' || coalesce(rp.last_name, ''),
         r.target_id, tp.name || ' ' || coalesce(tp.last_name, ''),
         r.resolved_at, r.resolution_note
    from public.user_reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles tp on tp.id = r.target_id
   where exists (select 1 from public.profiles a where a.id = auth.uid() and a.is_admin)
   order by (r.status = 'new') desc, r.created_at desc
   limit 200;
$$;
revoke all on function public.admin_list_reports() from public, anon;
grant execute on function public.admin_list_reports() to authenticated;

create or replace function public.admin_resolve_report(_id uuid, _status text, _note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles a where a.id = auth.uid() and a.is_admin) then
    raise exception 'admin only';
  end if;
  if _status not in ('reviewed', 'actioned', 'dismissed') then raise exception 'bad status'; end if;
  update public.user_reports
     set status = _status, resolved_at = now(), resolution_note = nullif(trim(coalesce(_note, '')), '')
   where id = _id;
end $$;
revoke all on function public.admin_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;

create or replace function public.submit_withdrawal(_name text, _email text, _purchase text, _note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad email'; end if;
  insert into public.withdrawal_requests (user_id, name, email, purchase, note)
  values (auth.uid(), trim(_name), lower(trim(_email)), trim(_purchase), nullif(trim(coalesce(_note, '')), ''))
  returning id into _id;
  return _id;
end $$;
revoke all on function public.submit_withdrawal(text, text, text, text) from public;
grant execute on function public.submit_withdrawal(text, text, text, text) to anon, authenticated;

create or replace function public.admin_list_withdrawals()
returns setof public.withdrawal_requests
language sql stable security definer set search_path = public as $$
  select * from public.withdrawal_requests
   where exists (select 1 from public.profiles a where a.id = auth.uid() and a.is_admin)
   order by (status = 'new') desc, created_at desc
   limit 200;
$$;
revoke all on function public.admin_list_withdrawals() from public, anon;
grant execute on function public.admin_list_withdrawals() to authenticated;

create or replace function public.admin_resolve_withdrawal(_id uuid, _status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles a where a.id = auth.uid() and a.is_admin) then
    raise exception 'admin only';
  end if;
  if _status not in ('refunded', 'rejected', 'invalid') then raise exception 'bad status'; end if;
  update public.withdrawal_requests set status = _status, resolved_at = now() where id = _id;
end $$;
revoke all on function public.admin_resolve_withdrawal(uuid, text) from public, anon;
grant execute on function public.admin_resolve_withdrawal(uuid, text) to authenticated;

create or replace function public.unsubscribe_email(_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare _email text;
begin
  if coalesce(trim(_token), '') = '' or length(_token) > 200 then return false; end if;
  select email into _email from public.email_unsubscribe_tokens where token = _token;
  if _email is null then return false; end if;
  update public.email_unsubscribe_tokens set used_at = now() where token = _token;
  insert into public.suppressed_emails (email, reason) values (_email, 'unsubscribe')
  on conflict (email) do nothing;
  update public.profiles p set email_notifs = false
    from auth.users u where u.email = _email and p.id = u.id;
  return true;
end $$;
revoke all on function public.unsubscribe_email(text) from public;
grant execute on function public.unsubscribe_email(text) to anon, authenticated;

create or replace function public.purge_old_logs()
returns void
language sql security definer set search_path = public as $$
  delete from public.push_events where sent_at < now() - interval '12 months';
  delete from public.email_send_log where created_at < now() - interval '12 months';
$$;
revoke all on function public.purge_old_logs() from public, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('purge-old-logs');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'purge-old-logs',
  '41 3 * * *',
  $cron$ SELECT public.purge_old_logs(); $cron$
);

notify pgrst, 'reload schema';