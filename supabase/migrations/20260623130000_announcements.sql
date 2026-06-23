-- Founder broadcast: an in-app announcement the admin posts; everyone sees it on
-- the board. One active at a time.
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  link text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
CREATE POLICY "active announcements readable" ON public.announcements
  FOR SELECT TO authenticated USING (active = true);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements (active, created_at DESC);

CREATE OR REPLACE FUNCTION public.post_announcement(_body text, _link text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _body IS NULL OR length(trim(_body)) = 0 THEN RAISE EXCEPTION 'empty'; END IF;
  UPDATE public.announcements SET active = false WHERE active = true;
  INSERT INTO public.announcements (body, link, created_by)
  VALUES (trim(_body), NULLIF(trim(_link), ''), auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.clear_announcements()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.announcements SET active = false WHERE active = true;
END $$;

GRANT EXECUTE ON FUNCTION public.post_announcement(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_announcements() TO authenticated;
