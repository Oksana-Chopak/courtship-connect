create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists auto_confirm_new_user on auth.users;
create trigger auto_confirm_new_user
  after insert on auth.users
  for each row execute function public.auto_confirm_new_user();