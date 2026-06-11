
-- Enums
CREATE TYPE public.vibe_t AS ENUM ('chill','friendly','sweat');
CREATE TYPE public.looking_for_t AS ENUM ('regular','dropin','both');
CREATE TYPE public.buddy_optin_t AS ENUM ('yes','sometimes','no');
CREATE TYPE public.sos_format_t AS ENUM ('singles','doubles_need1','doubles_need2');
CREATE TYPE public.court_status_t AS ENUM ('booked_paid','booked','will_book','public');
CREATE TYPE public.sos_status_t AS ENUM ('active','claimed','expired','cancelled');

-- Invite codes
CREATE TABLE public.invite_codes (
  code text PRIMARY KEY,
  uses_remaining int NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invite_codes TO anon, authenticated;
GRANT ALL ON public.invite_codes TO service_role;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read invite codes" ON public.invite_codes FOR SELECT USING (true);

INSERT INTO public.invite_codes(code, uses_remaining) VALUES ('UPPSALA80', 1000);

-- Courts
CREATE TABLE public.courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area text
);
GRANT SELECT ON public.courts TO anon, authenticated;
GRANT ALL ON public.courts TO service_role;
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courts readable by all" ON public.courts FOR SELECT USING (true);

INSERT INTO public.courts(name, area) VALUES
  ('Fyrishov', 'Fyrishov'),
  ('UTK (Uppsala Tennisklubb)', 'Centrum'),
  ('Studenternas', 'Studenternas'),
  ('Stadsträdgården Court', 'Centrum'),
  ('Gränby Court', 'Gränby'),
  ('Sunnersta Court', 'Sunnersta'),
  ('Luthagen Court', 'Luthagen');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  photo_url text,
  phone_e164 text NOT NULL,
  level int NOT NULL CHECK (level BETWEEN 1 AND 5),
  formats text[] NOT NULL DEFAULT '{}',
  play_times text[] NOT NULL DEFAULT '{}',
  vibe vibe_t NOT NULL DEFAULT 'friendly',
  looking_for looking_for_t NOT NULL DEFAULT 'both',
  home_courts text,
  buddy_optin buddy_optin_t NOT NULL DEFAULT 'sometimes',
  buddy_radius_km int NOT NULL DEFAULT 10,
  rescues_count int NOT NULL DEFAULT 0,
  ghost_badge boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see all profiles. Phone is filtered via a public view.
CREATE POLICY "profiles visible to authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Public view that EXCLUDES phone_e164 — this is what the client reads
CREATE VIEW public.profiles_public AS
  SELECT id, name, photo_url, level, formats, play_times, vibe, looking_for,
         home_courts, buddy_optin, buddy_radius_km, rescues_count, ghost_badge, created_at
  FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated;

-- SOS requests
CREATE TABLE public.sos_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  play_at timestamptz NOT NULL,
  court_id uuid REFERENCES public.courts(id),
  format sos_format_t NOT NULL,
  level_min int NOT NULL DEFAULT 1,
  level_max int NOT NULL DEFAULT 5,
  court_status court_status_t NOT NULL,
  note text,
  status sos_status_t NOT NULL DEFAULT 'active',
  claimed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sos_requests TO authenticated;
GRANT ALL ON public.sos_requests TO service_role;
ALTER TABLE public.sos_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sos readable by authenticated" ON public.sos_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "sos insert own" ON public.sos_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);
CREATE POLICY "sos update own or claim" ON public.sos_requests FOR UPDATE TO authenticated USING (auth.uid() = caller_id OR auth.uid() = claimed_by);

-- Games
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id uuid REFERENCES public.sos_requests(id) ON DELETE SET NULL,
  player_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  played_at timestamptz NOT NULL,
  confirmed_a boolean NOT NULL DEFAULT false,
  confirmed_b boolean NOT NULL DEFAULT false,
  reported_noshow uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games visible to participants" ON public.games FOR SELECT TO authenticated
  USING (auth.uid() = player_a OR auth.uid() = player_b);
CREATE POLICY "games update by participants" ON public.games FOR UPDATE TO authenticated
  USING (auth.uid() = player_a OR auth.uid() = player_b);

-- Function to get WhatsApp link (phone access controlled server-side)
CREATE OR REPLACE FUNCTION public.get_whatsapp_phone(target_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phone_e164 FROM public.profiles WHERE id = target_id
  AND auth.uid() IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_phone(uuid) TO authenticated;
