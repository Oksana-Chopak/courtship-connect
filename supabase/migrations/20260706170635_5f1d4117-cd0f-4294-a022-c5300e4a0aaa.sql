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

create table if not exists public.coach_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sport text not null default 'tennis' check (sport in ('tennis','padel','badminton')),
  level int not null default 3,
  goal text not null,
  availability text[] not null default '{}',
  city text,
  note text,
  status text not null default 'new' check (status in ('new','in_progress','matched','closed','cancelled')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.coach_requests to authenticated;
grant all on public.coach_requests to service_role;

alter table public.coach_requests enable row level security;

drop policy if exists coach_req_select_own on public.coach_requests;
create policy coach_req_select_own on public.coach_requests
  for select to authenticated using (user_id = auth.uid());

create or replace function public.request_coach(_sport text, _goal text, _availability text[], _note text default null)
returns table(ok boolean, reason text, id uuid)
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _p public.profiles; _id uuid; _admins uuid[];
begin
  if _uid is null then return query select false, 'not_authenticated'::text, null::uuid; return; end if;
  if coalesce(trim(_goal), '') = '' then return query select false, 'goal_required'::text, null::uuid; return; end if;
  if _sport not in ('tennis','padel','badminton') then _sport := 'tennis'; end if;
  if exists (select 1 from public.coach_requests
              where user_id = _uid and status in ('new','in_progress')) then
    return query select false, 'already_open'::text, null::uuid; return;
  end if;
  select * into _p from public.profiles where id = _uid;
  insert into public.coach_requests (user_id, sport, level, goal, availability, city, note)
  values (_uid, _sport, coalesce(_p.level, 3), trim(_goal), coalesce(_availability, '{}'), _p.home_city, nullif(trim(coalesce(_note,'')), ''))
  returning coach_requests.id into _id;
  select coalesce(array_agg(id), '{}') into _admins from public.profiles where is_admin;
  perform public._push_users(
    _admins,
    '🎓 Coach request from ' || coalesce(_p.name, 'a player'),
    coalesce(_p.name,'Player') || ' (L' || coalesce(_p.level,3)::text || ', ' || _sport || ') wants to level up — open the admin queue.',
    '/settings',
    'coach-req-' || _id::text
  );
  return query select true, 'ok'::text, _id;
end $$;

revoke all on function public.request_coach(text, text, text[], text) from public, anon;
grant execute on function public.request_coach(text, text, text[], text) to authenticated;

create or replace function public.my_open_coach_request()
returns setof public.coach_requests
language sql stable security definer set search_path = public as $$
  select * from public.coach_requests
   where user_id = auth.uid() and status in ('new','in_progress','matched')
   order by created_at desc limit 1;
$$;
revoke all on function public.my_open_coach_request() from public, anon;
grant execute on function public.my_open_coach_request() to authenticated;

create or replace function public.cancel_coach_request(_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  update public.coach_requests
     set status = 'cancelled', updated_at = now()
   where id = _id and user_id = _uid and status in ('new','in_progress');
  return found;
end $$;
revoke all on function public.cancel_coach_request(uuid) from public, anon;
grant execute on function public.cancel_coach_request(uuid) to authenticated;

create or replace function public.admin_list_coach_requests()
returns table(
  id uuid, created_at timestamptz, status text, sport text, level int,
  goal text, availability text[], city text, note text, admin_note text,
  user_id uuid, name text, last_name text, phone_e164 text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.created_at, r.status, r.sport, r.level,
         r.goal, r.availability, r.city, r.note, r.admin_note,
         p.id, p.name, p.last_name, p.phone_e164
    from public.coach_requests r
    join public.profiles p on p.id = r.user_id
   where exists (select 1 from public.profiles a where a.id = auth.uid() and a.is_admin)
     and r.status <> 'cancelled'
   order by case r.status when 'new' then 0 when 'in_progress' then 1 when 'matched' then 2 else 3 end,
            r.created_at desc
   limit 200;
$$;
revoke all on function public.admin_list_coach_requests() from public, anon;
grant execute on function public.admin_list_coach_requests() to authenticated;

create or replace function public.admin_set_coach_request(_id uuid, _status text, _admin_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare _r public.coach_requests;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;
  if _status not in ('new','in_progress','matched','closed') then
    raise exception 'bad status';
  end if;
  update public.coach_requests
     set status = _status,
         admin_note = coalesce(nullif(trim(coalesce(_admin_note,'')),''), admin_note),
         updated_at = now()
   where id = _id
   returning * into _r;
  if not found then raise exception 'not_found'; end if;
  if _status = 'matched' then
    perform public._push_users(
      array[_r.user_id],
      '🎓 Your coach is ready!',
      'We found you a coach — Oxy will connect you on WhatsApp with the details.',
      '/coach',
      'coach-matched-' || _r.id::text
    );
  end if;
end $$;
revoke all on function public.admin_set_coach_request(uuid, text, text) from public, anon;
grant execute on function public.admin_set_coach_request(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';