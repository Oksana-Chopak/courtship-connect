CREATE TABLE IF NOT EXISTS public.event_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  city text,
  location text NOT NULL,
  format text,
  description text,
  contact text,
  price_sek int,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_requests_insert ON public.event_requests;
CREATE POLICY event_requests_insert ON public.event_requests
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS event_requests_select ON public.event_requests;
CREATE POLICY event_requests_select ON public.event_requests
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR host_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
  );

DROP POLICY IF EXISTS event_requests_admin_update ON public.event_requests;
CREATE POLICY event_requests_admin_update ON public.event_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

GRANT SELECT, INSERT, UPDATE ON public.event_requests TO authenticated;
GRANT ALL ON public.event_requests TO service_role;