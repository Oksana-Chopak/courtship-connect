-- ═══════════════════════════════════════════════════════════════════════════
-- BATCH16 · Release audit fixes (2026-08-12)
-- Run in Supabase SQL editor (or Lovable → run SQL). Safe to re-run.
--   1. edit_sos learns _court_type_any — "🏟️ Any surface" now round-trips
--      through edit (audit P1-9). Old signature dropped to avoid PostgREST
--      overload ambiguity; old clients keep working (new arg has a default).
--   2. close_my_coach_request — a MATCHED coaching request can be closed by
--      its owner ("got my coach"), ending the forever-card (audit P1-3).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · edit_sos + _court_type_any ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.edit_sos(uuid,timestamptz,uuid,text,int,int,text,text,text,int,text,timestamptz);

create or replace function public.edit_sos(
  _sos_id uuid, _play_at timestamptz, _court_id uuid, _format text,
  _level_min int, _level_max int, _court_status text, _note text,
  _court_type text, _duration_min int, _sport text default null,
  _play_until timestamptz default null, _court_type_any boolean default null
) returns table(ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _need int; _filled int;
begin
  if _uid is null then return query select false, 'not_authenticated'::text; return; end if;
  if _play_at is null or _play_at < now() then return query select false, 'time_gone'::text; return; end if;
  if _play_until is not null and _play_until <= _play_at then return query select false, 'bad_window'::text; return; end if;
  _need := case when _format = 'doubles_need2' then 2 when _format = 'doubles_need3' then 3 else 1 end;
  select coalesce(spots_filled,0) into _filled from public.sos_requests where id=_sos_id and caller_id=_uid;
  -- never drop spots_needed below who's already in
  if _filled is not null and _need < _filled then _need := _filled; end if;
  update public.sos_requests
     set play_at=_play_at, court_id=_court_id, format=_format::sos_format_t,
         spots_needed=_need,
         level_min=greatest(1, least(5, coalesce(_level_min,1))),
         level_max=greatest(1, least(5, coalesce(_level_max,5))),
         court_status=_court_status::court_status_t,
         note=nullif(trim(coalesce(_note,'')),''),
         court_type=_court_type::court_type_t,
         duration_min=_duration_min,
         sport=case when _sport in ('tennis','padel','badminton') then _sport else sport end,
         play_until=_play_until,
         -- null = old client that doesn't know the flag → keep as-is;
         -- true/false = explicit choice from the wizard → save it (P1-9)
         court_type_any=coalesce(_court_type_any, court_type_any),
         status=case when coalesce(spots_filled,0) >= _need then 'claimed'::sos_status_t else 'active'::sos_status_t end
   where id=_sos_id and caller_id=_uid and status='active';
  if not found then return query select false, 'not_found_or_not_editable'::text; return; end if;
  return query select true, 'ok'::text;
end $$;
REVOKE ALL ON FUNCTION public.edit_sos(uuid,timestamptz,uuid,text,int,int,text,text,text,int,text,timestamptz,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.edit_sos(uuid,timestamptz,uuid,text,int,int,text,text,text,int,text,timestamptz,boolean) TO authenticated;

-- ── 2 · close a MATCHED coaching request ────────────────────────────────────
create or replace function public.close_my_coach_request(_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  update public.coach_requests
     set status = 'closed', updated_at = now()
   where id = _id and user_id = _uid and status = 'matched';
  return found;
end $$;
REVOKE ALL ON FUNCTION public.close_my_coach_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.close_my_coach_request(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
