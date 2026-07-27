ALTER TABLE public.games ALTER COLUMN player_b DROP NOT NULL;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS guest_name text;

DROP FUNCTION IF EXISTS public.log_game(uuid, timestamptz, text, uuid, uuid);

CREATE FUNCTION public.log_game(
  _other_id uuid DEFAULT NULL,
  _played_at timestamptz DEFAULT NULL,
  _score text DEFAULT NULL,
  _winner uuid DEFAULT NULL,
  _court_id uuid DEFAULT NULL,
  _guest_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id    uuid;
  _when  timestamptz := coalesce(_played_at, now());
  _guest text := nullif(left(btrim(coalesce(_guest_name, '')), 60), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _other_id IS NULL AND _guest IS NULL THEN RAISE EXCEPTION 'pick another player'; END IF;
  IF _other_id IS NOT NULL AND _guest IS NOT NULL THEN _guest := NULL; END IF;

  IF _other_id IS NOT NULL THEN
    IF _other_id = auth.uid() THEN RAISE EXCEPTION 'pick another player'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _other_id) THEN RAISE EXCEPTION 'unknown player'; END IF;
    IF _winner IS NOT NULL AND _winner <> auth.uid() AND _winner <> _other_id THEN RAISE EXCEPTION 'bad winner'; END IF;
  ELSE
    IF length(_guest) < 2 THEN RAISE EXCEPTION 'guest name too short'; END IF;
    _winner := NULL;
  END IF;

  IF _court_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.courts WHERE id = _court_id) THEN
    RAISE EXCEPTION 'unknown court';
  END IF;

  IF _when > now() + interval '1 hour' THEN RAISE EXCEPTION 'game is in the future'; END IF;

  IF _other_id IS NOT NULL THEN
    SELECT id INTO _id FROM public.games
     WHERE sos_id IS NULL
       AND played_at BETWEEN _when - interval '90 minutes' AND _when + interval '90 minutes'
       AND ( (player_a = auth.uid() AND player_b = _other_id)
          OR (player_a = _other_id AND player_b = auth.uid()) )
     LIMIT 1;
  ELSE
    SELECT id INTO _id FROM public.games
     WHERE sos_id IS NULL
       AND player_a = auth.uid() AND player_b IS NULL
       AND lower(coalesce(guest_name, '')) = lower(_guest)
       AND played_at BETWEEN _when - interval '90 minutes' AND _when + interval '90 minutes'
     LIMIT 1;
  END IF;
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  INSERT INTO public.games
    (player_a, player_b, guest_name, played_at, sos_id, score, winner, court_id, confirmed_a, confirmed_b)
  VALUES
    (auth.uid(), _other_id, _guest, _when, NULL, nullif(trim(_score), ''), _winner, _court_id, true, true)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.log_game(uuid, timestamptz, text, uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_game(uuid, timestamptz, text, uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';