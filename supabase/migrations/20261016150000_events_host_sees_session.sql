-- Courtship · events: the host sees which session someone joined, and never books herself
-- 2026-10-16. Idempotent. Paste the whole file in Lovable → More → Cloud → SQL editor → Run.
-- The last SELECT must show five × true.

-- 1 · A session's date and time in words, on the court's own clock (Swedish / English).
create or replace function public._court_when(_ts timestamptz, _city text, _lang text)
returns text language sql stable set search_path = public as $$
  select case when _lang = 'sv'
      then (array['sön','mån','tis','ons','tors','fre','lör'])[extract(dow from l)::int + 1]
           || ' ' || extract(day from l)::int || ' '
           || (array['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'])[extract(month from l)::int]
      else (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from l)::int + 1]
           || ' ' || extract(day from l)::int || ' '
           || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from l)::int]
    end || ' ' || to_char(l, 'HH24:MI')
  from (select _ts at time zone (case when trim(coalesce(_city, '')) = 'Miami' then 'America/New_York' else 'Europe/Stockholm' end) as l) x
$$;
revoke all on function public._court_when(timestamptz, text, text) from public, anon, authenticated;

-- 2 · "X joined your event": weekly events share a title, so the message now
--     says WHICH session (date + time + city), whether it is paid and not yet
--     Swished, in the host's language — and opens that exact card on the board.
create or replace function public.notify_host_on_event_join()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare _host uuid; _title text; _starts timestamptz; _city text; _price int;
        _joiner text; _lang text; _when text; _t text; _b text;
begin
  select host_id, title, starts_at, city, price_sek
    into _host, _title, _starts, _city, _price
    from public.event_requests where id = new.event_id;
  if _host is null or _host = new.user_id then return new; end if;
  select name into _joiner from public.profiles where id = new.user_id;
  select coalesce(lang, 'en') into _lang from public.profiles where id = _host;
  _when := public._court_when(_starts, _city, _lang);
  if _lang = 'sv' then
    _t := '🎾 ' || coalesce(_joiner, 'Någon') || ' anmälde sig: ' || coalesce(_title, 'ditt event') || ' · ' || _when;
    _b := _when || coalesce(' · ' || nullif(_city, ''), '')
          || case when coalesce(_price, 0) > 0 then ' · ' || _price || ' kr — inte betalt än (Swish)' else '' end
          || '. Tryck för att se vilka som kommer.';
  else
    _t := '🎾 ' || coalesce(_joiner, 'Someone') || ' joined: ' || coalesce(_title, 'your event') || ' · ' || _when;
    _b := _when || coalesce(' · ' || nullif(_city, ''), '')
          || case when coalesce(_price, 0) > 0 then ' · ' || _price || ' kr — not paid yet (Swish)' else '' end
          || '. Tap to see who''s coming.';
  end if;
  perform public._push_users(
    array[_host], _t, _b,
    '/board?focus_event=' || new.event_id::text,
    'evjoin-' || new.event_id::text || '-' || new.user_id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_host_on_event_join on public.event_attendees;
create trigger trg_notify_host_on_event_join
  after insert on public.event_attendees
  for each row execute function public.notify_host_on_event_join();

-- 3 · The organizer can't book a spot at her own event (opening her own link
--     used to do exactly that).
CREATE OR REPLACE FUNCTION public.join_event(_event_id uuid)
RETURNS TABLE(ok boolean, reason text, attendee_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ev public.event_requests; _st text;
BEGIN
  IF _uid IS NULL THEN RETURN QUERY SELECT false,'not_authenticated'::text,NULL::text; RETURN; END IF;
  SELECT * INTO _ev FROM public.event_requests WHERE id=_event_id FOR UPDATE;
  IF NOT FOUND OR _ev.status<>'approved' THEN RETURN QUERY SELECT false,'not_found'::text,NULL::text; RETURN; END IF;
  IF _ev.host_id = _uid THEN RETURN QUERY SELECT false,'own_event'::text,NULL::text; RETURN; END IF;
  IF _ev.starts_at < now() THEN RETURN QUERY SELECT false,'past'::text,NULL::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.event_attendees WHERE event_id=_event_id AND user_id=_uid)
    THEN RETURN QUERY SELECT false,'already_in'::text,NULL::text; RETURN; END IF;
  IF _ev.capacity IS NOT NULL AND _ev.spots_taken >= _ev.capacity
    THEN RETURN QUERY SELECT false,'full'::text,NULL::text; RETURN; END IF;
  _st := CASE WHEN COALESCE(_ev.price_sek,0) > 0 THEN 'booked' ELSE 'interested' END;
  INSERT INTO public.event_attendees (event_id,user_id,status) VALUES (_event_id,_uid,_st);
  UPDATE public.event_requests SET spots_taken = spots_taken + 1 WHERE id=_event_id;
  RETURN QUERY SELECT true,'ok'::text,_st;
END; $$;
REVOKE ALL ON FUNCTION public.join_event(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_event(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- VERIFY — five × true
SELECT
  (SELECT bool_and(prosrc LIKE '%own_event%') FROM pg_proc WHERE proname = 'join_event')                  AS host_cannot_book_own_event,
  (SELECT bool_and(prosrc LIKE '%focus_event%') FROM pg_proc WHERE proname = 'notify_host_on_event_join') AS join_message_has_date_and_link,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_host_on_event_join' AND NOT tgisinternal)   AS trigger_on,
  public._court_when('2030-06-15T16:00:00Z', 'Uppsala', 'en') = 'Sat 15 Jun 18:00'                         AS english_date_ok,
  public._court_when('2030-10-17T16:00:00Z', 'Stockholm', 'sv') = 'tors 17 okt 18:00'                     AS swedish_date_ok;
