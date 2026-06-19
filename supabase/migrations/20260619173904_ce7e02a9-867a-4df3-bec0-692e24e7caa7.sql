DROP POLICY IF EXISTS event_attendees_insert ON public.event_attendees;
REVOKE INSERT ON public.event_attendees FROM authenticated;