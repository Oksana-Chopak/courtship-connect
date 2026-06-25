create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

grant all on public.app_config to service_role;

alter table public.app_config enable row level security;

create or replace function public.get_support_swish()
returns text language sql stable security definer set search_path = public as $$
  select value from public.app_config where key = 'support_swish';
$$;
revoke all on function public.get_support_swish() from public, anon;
grant execute on function public.get_support_swish() to authenticated;

create or replace function public.set_support_swish(_number text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;
  if coalesce(trim(_number), '') = '' then
    delete from public.app_config where key = 'support_swish';
  else
    insert into public.app_config (key, value) values ('support_swish', trim(_number))
      on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;
revoke all on function public.set_support_swish(text) from public, anon;
grant execute on function public.set_support_swish(text) to authenticated;