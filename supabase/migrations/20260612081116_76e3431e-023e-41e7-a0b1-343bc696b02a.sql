
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Allow admins to update invite codes
DROP POLICY IF EXISTS "admins update invite codes" ON public.invite_codes;
CREATE POLICY "admins update invite codes" ON public.invite_codes FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

CREATE OR REPLACE FUNCTION public.confirm_game(_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _g public.games;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _uid = _g.player_a THEN
    UPDATE public.games SET confirmed_a = true WHERE id = _game_id;
  ELSIF _uid = _g.player_b THEN
    UPDATE public.games SET confirmed_b = true WHERE id = _game_id;
  ELSE
    RAISE EXCEPTION 'not_participant';
  END IF;
  -- If both players confirmed, clear ghost badge on both (forgiving)
  IF (SELECT confirmed_a AND confirmed_b FROM public.games WHERE id = _game_id) THEN
    UPDATE public.profiles SET ghost_badge = false
     WHERE id IN (_g.player_a, _g.player_b);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.report_noshow(_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _g public.games; _other uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _uid = _g.player_a THEN _other := _g.player_b;
  ELSIF _uid = _g.player_b THEN _other := _g.player_a;
  ELSE RAISE EXCEPTION 'not_participant';
  END IF;
  UPDATE public.games SET reported_noshow = _other WHERE id = _game_id;
  UPDATE public.profiles SET ghost_badge = true WHERE id = _other;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS TABLE(profiles_count int, active_sos_count int, fill_rate numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::int FROM public.profiles),
    (SELECT COUNT(*)::int FROM public.sos_requests WHERE status = 'active' AND play_at >= now()),
    COALESCE(
      (SELECT (COUNT(*) FILTER (WHERE status = 'claimed'))::numeric
              / NULLIF(COUNT(*) FILTER (WHERE status <> 'cancelled'), 0)
         FROM public.sos_requests),
      0
    );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_invite_active(_code text, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.invite_codes SET active = _active WHERE code = _code;
END; $$;
