
-- 1) allow self-applause (was raise-exception 'self')
create or replace function public.give_kudos(_to uuid)
returns int language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _n int;
begin
  if _uid is null then raise exception 'not_authenticated'; end if;
  insert into public.kudos (from_id, to_id) values (_uid, _to)
    on conflict (from_id, to_id) do nothing;
  select count(*)::int into _n from public.kudos where to_id = _to;
  return _n;
end $$;

revoke all on function public.give_kudos(uuid) from public, anon;
grant execute on function public.give_kudos(uuid) to authenticated;

-- 2) who applauded someone (tap the count to see the list)
create or replace function public.kudos_by(_to uuid)
returns table(from_id uuid, name text, photo_url text)
language sql stable security definer set search_path = public as $$
  select k.from_id, p.name, p.photo_url
    from public.kudos k
    join public.profiles p on p.id = k.from_id
   where k.to_id = _to
   order by k.created_at desc
   limit 100;
$$;

revoke all on function public.kudos_by(uuid) from public, anon;
grant execute on function public.kudos_by(uuid) to authenticated;

notify pgrst, 'reload schema';
