CREATE OR REPLACE FUNCTION public.delete_my_event(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.event_requests WHERE id = _id AND host_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_your_event'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.delete_my_event(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.event_attendee_contacts(_event_id uuid)
RETURNS TABLE (id uuid, user_id uuid, status text, name text, phone_e164 text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_requests e WHERE e.id = _event_id AND e.host_id = _uid) THEN
    RAISE EXCEPTION 'not_your_event';
  END IF;
  RETURN QUERY
    SELECT a.id, a.user_id, a.status, COALESCE(p.name, 'Player'), p.phone_e164
    FROM public.event_attendees a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.event_id = _event_id
    ORDER BY a.created_at ASC;
END $$;
GRANT EXECUTE ON FUNCTION public.event_attendee_contacts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_event(_id uuid, _data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.event_requests SET
    title       = COALESCE(NULLIF(_data->>'title',''), title),
    starts_at   = COALESCE(NULLIF(_data->>'starts_at','')::timestamptz, starts_at),
    city        = NULLIF(_data->>'city',''),
    location    = COALESCE(NULLIF(_data->>'location',''), location),
    format      = NULLIF(_data->>'format',''),
    capacity    = NULLIF(_data->>'capacity','')::int,
    price_sek   = NULLIF(_data->>'price_sek','')::int,
    description = NULLIF(_data->>'description','')
  WHERE id = _id AND host_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_your_event'; END IF;
  IF (_data ? 'swish_number') OR (_data ? 'contact') THEN
    INSERT INTO public.event_private (event_id, swish_number, contact)
    VALUES (_id, NULLIF(_data->>'swish_number',''), NULLIF(_data->>'contact',''))
    ON CONFLICT (event_id) DO UPDATE SET swish_number = EXCLUDED.swish_number, contact = EXCLUDED.contact;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.update_my_event(uuid, jsonb) TO authenticated;