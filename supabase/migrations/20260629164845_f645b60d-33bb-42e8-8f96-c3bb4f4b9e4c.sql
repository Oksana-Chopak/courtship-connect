ALTER TABLE public.event_requests ADD COLUMN IF NOT EXISTS level_min int;

ALTER TABLE public.event_requests ADD COLUMN IF NOT EXISTS level_max int;

ALTER TABLE public.event_requests ADD COLUMN IF NOT EXISTS duration_min int;

CREATE OR REPLACE FUNCTION public.update_my_event(_id uuid, _data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.event_requests SET
    title        = COALESCE(NULLIF(_data->>'title',''), title),
    starts_at    = COALESCE(NULLIF(_data->>'starts_at','')::timestamptz, starts_at),
    city         = NULLIF(_data->>'city',''),
    location     = COALESCE(NULLIF(_data->>'location',''), location),
    format       = NULLIF(_data->>'format',''),
    capacity     = NULLIF(_data->>'capacity','')::int,
    price_sek    = NULLIF(_data->>'price_sek','')::int,
    level_min    = NULLIF(_data->>'level_min','')::int,
    level_max    = NULLIF(_data->>'level_max','')::int,
    duration_min = NULLIF(_data->>'duration_min','')::int,
    description  = NULLIF(_data->>'description','')
  WHERE id = _id AND host_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_your_event'; END IF;
  IF (_data ? 'swish_number') OR (_data ? 'contact') THEN
    INSERT INTO public.event_private (event_id, swish_number, contact)
    VALUES (_id, NULLIF(_data->>'swish_number',''), NULLIF(_data->>'contact',''))
    ON CONFLICT (event_id) DO UPDATE SET swish_number = EXCLUDED.swish_number, contact = EXCLUDED.contact;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.update_my_event(uuid, jsonb) TO authenticated;