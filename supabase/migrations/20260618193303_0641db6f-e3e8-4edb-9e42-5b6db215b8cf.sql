CREATE OR REPLACE FUNCTION public.top_rescuers_month()
RETURNS TABLE(user_id uuid, name text, rescues int)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT g.player_b AS user_id, p.name, COUNT(*)::int AS rescues
  FROM public.games g
  JOIN public.profiles p ON p.id = g.player_b
  WHERE g.played_at >= date_trunc('month', now())
    AND g.played_at <  date_trunc('month', now()) + interval '1 month'
  GROUP BY g.player_b, p.name
  ORDER BY rescues DESC, p.name
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.top_rescuers_month() TO authenticated;