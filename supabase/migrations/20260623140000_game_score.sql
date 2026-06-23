-- Post-game score capture: optional set score recorded at confirmation.
-- Fuel for a future rating + "Wrapped". Captured now, surfaced in history.
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS score text;

-- Replace confirm_game with a 2-arg version (optional score). Drop the 1-arg
-- form so the overload is unambiguous; the new one defaults _score so old calls
-- (named-param RPC with only _game_id) still resolve.
DROP FUNCTION IF EXISTS public.confirm_game(uuid);
CREATE OR REPLACE FUNCTION public.confirm_game(_game_id uuid, _score text DEFAULT NULL)
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
  IF _score IS NOT NULL AND length(trim(_score)) > 0 THEN
    UPDATE public.games SET score = left(trim(_score), 40) WHERE id = _game_id;
  END IF;
  IF (SELECT confirmed_a AND confirmed_b FROM public.games WHERE id = _game_id) THEN
    UPDATE public.profiles SET ghost_badge = false WHERE id IN (_g.player_a, _g.player_b);
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.confirm_game(uuid, text) TO authenticated;
