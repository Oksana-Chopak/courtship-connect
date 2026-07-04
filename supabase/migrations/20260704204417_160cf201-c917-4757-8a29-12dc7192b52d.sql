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

create table if not exists public.sos_applications (
  id uuid primary key default gen_random_uuid(),
  sos_id uuid not null references public.sos_requests(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','picked','declined','withdrawn')),
  created_at timestamptz not null default now(),
  unique (sos_id, applicant_id)
);

grant select on public.sos_applications to authenticated;
grant all on public.sos_applications to service_role;

alter table public.sos_applications enable row level security;

drop policy if exists apps_select_mine_or_host on public.sos_applications;
create policy apps_select_mine_or_host on public.sos_applications
  for select to authenticated
  using (
    applicant_id = auth.uid()
    or exists (select 1 from public.sos_requests s where s.id = sos_id and s.caller_id = auth.uid())
  );

create or replace function public.apply_to_game(_sos_id uuid)
returns table(ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _sos public.sos_requests; _name text;
begin
  if _uid is null then return query select false, 'not_authenticated'::text; return; end if;
  select * into _sos from public.sos_requests where id = _sos_id for update;
  if not found then return query select false, 'not_found'::text; return; end if;
  if _sos.caller_id = _uid then return query select false, 'own_sos'::text; return; end if;
  if _sos.kind <> 'open' then return query select false, 'not_applicable'::text; return; end if;
  if _sos.status <> 'active' then return query select false, 'taken'::text; return; end if;
  if _sos.play_at < now() then
    update public.sos_requests set status = 'expired' where id = _sos_id;
    return query select false, 'expired'::text; return;
  end if;
  if exists (select 1 from public.games g where g.sos_id = _sos_id and (g.player_a = _uid or g.player_b = _uid)) then
    return query select false, 'already_in'::text; return;
  end if;
  if exists (select 1 from public.sos_applications a where a.sos_id = _sos_id and a.applicant_id = _uid and a.status = 'pending') then
    return query select false, 'already_applied'::text; return;
  end if;
  insert into public.sos_applications (sos_id, applicant_id, status)
  values (_sos_id, _uid, 'pending')
  on conflict (sos_id, applicant_id) do update set status = 'pending', created_at = now();
  select name into _name from public.profiles where id = _uid;
  perform public._push_users(
    array[_sos.caller_id],
    '🙋 ' || coalesce(_name, 'A player') || ' wants in!',
    'Your planned game has a new candidate — tap to pick your partner.',
    '/sos/' || _sos_id::text,
    'apply-' || _sos_id::text
  );
  return query select true, 'ok'::text;
end $$;

revoke all on function public.apply_to_game(uuid) from public, anon;
grant execute on function public.apply_to_game(uuid) to authenticated;

create or replace function public.withdraw_application(_sos_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then return false; end if;
  update public.sos_applications set status = 'withdrawn'
   where sos_id = _sos_id and applicant_id = _uid and status = 'pending';
  return found;
end $$;

revoke all on function public.withdraw_application(uuid) from public, anon;
grant execute on function public.withdraw_application(uuid) to authenticated;

create or replace function public.pick_applicant(_sos_id uuid, _applicant uuid)
returns table(ok boolean, reason text, game_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _sos public.sos_requests;
  _game_id uuid;
  _new_filled int;
  _host_name text; _court text; _losers uuid[];
begin
  if _uid is null then return query select false, 'not_authenticated'::text, null::uuid; return; end if;
  select * into _sos from public.sos_requests where id = _sos_id for update;
  if not found then return query select false, 'not_found'::text, null::uuid; return; end if;
  if _sos.caller_id <> _uid then return query select false, 'not_host'::text, null::uuid; return; end if;
  if _sos.status <> 'active' then return query select false, 'taken'::text, null::uuid; return; end if;
  if _sos.play_at < now() then
    update public.sos_requests set status = 'expired' where id = _sos_id;
    return query select false, 'expired'::text, null::uuid; return;
  end if;
  if not exists (select 1 from public.sos_applications a where a.sos_id = _sos_id and a.applicant_id = _applicant and a.status = 'pending') then
    return query select false, 'no_application'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.games g where g.sos_id = _sos_id and (g.player_a = _applicant or g.player_b = _applicant)) then
    return query select false, 'already_in'::text, null::uuid; return;
  end if;

  insert into public.games (player_a, player_b, played_at, sos_id)
  values (_sos.caller_id, _applicant, _sos.play_at, _sos_id)
  returning id into _game_id;

  _new_filled := coalesce(_sos.spots_filled, 0) + 1;
  update public.sos_requests
     set spots_filled = _new_filled, claimed_by = _applicant,
         status = case when _new_filled >= coalesce(spots_needed, 1) then 'claimed'::sos_status_t else 'active'::sos_status_t end
   where id = _sos_id;

  update public.profiles set rescues_count = rescues_count + 1 where id = _applicant;
  update public.sos_applications set status = 'picked' where sos_id = _sos_id and applicant_id = _applicant;

  select name into _host_name from public.profiles where id = _sos.caller_id;
  select name into _court from public.courts where id = _sos.court_id;
  perform public._push_users(
    array[_applicant],
    '🎾 You''re in! ' || coalesce(_host_name, 'The host') || ' picked you',
    coalesce(_court, 'Your game') || ' — tap for details and say hi.',
    '/sos/' || _sos_id::text,
    'picked-' || _sos_id::text
  );

  if _new_filled >= coalesce(_sos.spots_needed, 1) then
    select coalesce(array_agg(applicant_id), '{}') into _losers
      from public.sos_applications
     where sos_id = _sos_id and status = 'pending';
    update public.sos_applications set status = 'declined'
     where sos_id = _sos_id and status = 'pending';
    perform public._push_users(
      _losers,
      'This one''s taken 💔',
      'Stay ready — new games pop up every week 🎾',
      '/board',
      'declined-' || _sos_id::text
    );
  end if;

  return query select true, 'ok'::text, _game_id;
end $$;

revoke all on function public.pick_applicant(uuid, uuid) from public, anon;
grant execute on function public.pick_applicant(uuid, uuid) to authenticated;

create or replace function public.notify_on_flare()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare _applicants uuid[];
begin
  if new.status = 'active'
     and new.kind = 'sos'
     and new.flared_at is not null
     and new.flared_at is distinct from old.flared_at then
    begin
      perform net.http_post(
        url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/sos-notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2lkeHRyaXpneWNmdW1rcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDI0MTYsImV4cCI6MjA5Njc3ODQxNn0.xi8R_2bUsczwUWcZhH5NDw_HWEubQzE9fX4ewkGdfps'
        ),
        body := jsonb_build_object('sos_id', new.id)
      );
    exception when others then
      null;
    end;
    begin
      select coalesce(array_agg(applicant_id), '{}') into _applicants
        from public.sos_applications
       where sos_id = new.id and status = 'pending';
      perform public._push_users(
        _applicants,
        '⚡ It just went urgent!',
        'The game you applied to is up for grabs — first to claim plays 🎾',
        '/sos/' || new.id::text,
        'flare-app-' || new.id::text
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_flare on public.sos_requests;
create trigger trg_notify_on_flare
  after update of flared_at on public.sos_requests
  for each row execute function public.notify_on_flare();