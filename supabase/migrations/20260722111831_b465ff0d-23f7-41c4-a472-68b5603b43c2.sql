-- ── 1. Districts taxonomy ──
CREATE TABLE IF NOT EXISTS public.city_areas (
  city text NOT NULL,
  area text NOT NULL,
  sort int  NOT NULL DEFAULT 0,
  PRIMARY KEY (city, area)
);
ALTER TABLE public.city_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "areas readable by all" ON public.city_areas;
CREATE POLICY "areas readable by all" ON public.city_areas FOR SELECT USING (true);
GRANT SELECT ON public.city_areas TO anon, authenticated;

INSERT INTO public.city_areas (city, area, sort) VALUES
  ('Stockholm','Lidingö',1),
  ('Stockholm','Täby',2),
  ('Stockholm','Danderyd',3),
  ('Stockholm','Sollentuna',4),
  ('Stockholm','Upplands Väsby',5),
  ('Stockholm','Vallentuna',6),
  ('Stockholm','Solna/Sundbyberg',7),
  ('Stockholm','Bromma',8),
  ('Stockholm','Kungsholmen',9),
  ('Stockholm','Vasastan/City',10),
  ('Stockholm','Östermalm',11),
  ('Stockholm','Södermalm',12),
  ('Stockholm','Nacka',13),
  ('Stockholm','Enskede/Kärrtorp',14),
  ('Stockholm','Farsta',15),
  ('Stockholm','Huddinge',16),
  ('Uppsala','Centrum',1),
  ('Uppsala','Luthagen',2),
  ('Uppsala','Fyrishov',3),
  ('Uppsala','Gränby',4),
  ('Uppsala','Kåbo/Studenternas',5),
  ('Uppsala','Gottsunda',6),
  ('Uppsala','Sävja',7),
  ('Uppsala','Stenhagen',8)
ON CONFLICT (city, area) DO NOTHING;

-- ── 2. Areas in profile ──
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS areas text[] NOT NULL DEFAULT '{}';

-- ── 3. swipe_deck v2 ──
DROP FUNCTION IF EXISTS public.swipe_deck();
CREATE FUNCTION public.swipe_deck()
RETURNS TABLE(
  id uuid, name text, photo_url text, photos text[], level int, home_city text, home_cities text[],
  bio text, fav_shot text, home_courts text, sports text[], vibe text, formats text[], play_times text[],
  looking_for text, experience text, goals text[], games_played int, rescues_count int, member_since timestamptz,
  areas text[]
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT home_city, home_cities, level, play_times, goals, areas
      FROM public.profiles WHERE id = auth.uid()
  ),
  base AS (
    SELECT p.*,
      (
        p.home_city = (SELECT home_city FROM me)
        OR p.home_city = ANY (COALESCE((SELECT home_cities FROM me), ARRAY[]::text[]))
        OR (SELECT home_city FROM me) = ANY (COALESCE(p.home_cities, ARRAY[]::text[]))
      ) AS my_city,
      (
        (CASE WHEN COALESCE(p.areas,'{}') && COALESCE((SELECT areas FROM me),'{}') THEN 4 ELSE 0 END)
        + (CASE WHEN abs(p.level - COALESCE((SELECT level FROM me), 3)) <= 1 THEN 2 ELSE 0 END)
        + (CASE WHEN COALESCE(p.play_times,'{}') && COALESCE((SELECT play_times FROM me),'{}') THEN 1 ELSE 0 END)
        + (CASE WHEN COALESCE(p.goals,'{}') && COALESCE((SELECT goals FROM me),'{}') THEN 1 ELSE 0 END)
      ) AS match_score
    FROM public.profiles p
    WHERE p.id <> auth.uid()
      AND NOT public.is_buddy(auth.uid(), p.id)
  ),
  sw AS (SELECT target_id, liked, created_at FROM public.swipes WHERE liker_id = auth.uid()),
  ranked AS (
    SELECT b.*, 1 AS tier, random() AS rnd FROM base b LEFT JOIN sw ON sw.target_id = b.id
     WHERE sw.target_id IS NULL AND b.my_city
    UNION ALL
    SELECT b.*, 2, random() FROM base b LEFT JOIN sw ON sw.target_id = b.id
     WHERE sw.target_id IS NULL AND NOT b.my_city
    UNION ALL
    SELECT b.*, 3, extract(epoch FROM sw.created_at) FROM base b JOIN sw ON sw.target_id = b.id
     WHERE sw.liked = false
  )
  SELECT id, name, photo_url, photos, level, home_city, home_cities,
         bio, fav_shot, home_courts, sports, vibe::text, formats, play_times,
         looking_for::text, experience, goals, games_played, rescues_count, created_at,
         COALESCE(areas, '{}')
    FROM ranked
   ORDER BY tier ASC, match_score DESC, rnd ASC
   LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.swipe_deck() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.swipe_deck() TO authenticated;

-- ── 4. players_directory v3 ──
DROP FUNCTION IF EXISTS public.players_directory(uuid[]);
CREATE FUNCTION public.players_directory(_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id uuid, name text, last_name text, photo_url text, level int,
  formats text[], play_times text[], vibe vibe_t, looking_for looking_for_t,
  home_courts text, home_city text, home_cities text[], buddy_optin buddy_optin_t,
  buddy_radius_km int, rescues_count int, ghost_badge boolean,
  bio text, fav_shot text, games_played int, created_at timestamptz,
  member_tier text, sports text[], experience text, goals text[], areas text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, last_name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, home_city, home_cities, buddy_optin, buddy_radius_km,
         rescues_count, ghost_badge, bio, fav_shot, games_played, created_at,
         member_tier, coalesce(sports, '{tennis}'), experience, goals, coalesce(areas, '{}')
    FROM public.profiles
   WHERE (_ids IS NULL OR id = ANY(_ids));
$$;
REVOKE ALL ON FUNCTION public.players_directory(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.players_directory(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';