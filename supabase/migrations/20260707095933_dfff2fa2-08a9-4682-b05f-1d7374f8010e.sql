create or replace function public.edit_sos(
  _sos_id uuid,
  _play_at timestamptz,
  _court_id uuid,
  _format text,
  _level_min int,
  _level_max int,
  _court_status text,
  _note text,
  _court_type text,
  _duration_min int,
  _sport text default null
)
returns table(ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then return query select false, 'not_authenticated'::text; return; end if;
  if _play_at is null or _play_at < now() then return query select false, 'time_gone'::text; return; end if;

  update public.sos_requests
     set play_at      = _play_at,
         court_id     = _court_id,
         format       = _format::sos_format_t,
         level_min    = greatest(1, least(5, coalesce(_level_min, 1))),
         level_max    = greatest(1, least(5, coalesce(_level_max, 5))),
         court_status = _court_status::court_status_t,
         note         = nullif(trim(coalesce(_note, '')), ''),
         court_type   = _court_type::court_type_t,
         duration_min = _duration_min,
         sport        = case when _sport in ('tennis','padel','badminton') then _sport else sport end
   where id = _sos_id
     and caller_id = _uid
     and status = 'active';

  if not found then return query select false, 'not_found_or_not_editable'::text; return; end if;
  return query select true, 'ok'::text;
end $$;

revoke all on function public.edit_sos(uuid, timestamptz, uuid, text, int, int, text, text, text, int, text) from public, anon;
grant execute on function public.edit_sos(uuid, timestamptz, uuid, text, int, int, text, text, text, int, text) to authenticated;

notify pgrst, 'reload schema';