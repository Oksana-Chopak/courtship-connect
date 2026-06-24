-- Game duration (minutes). Default 60 (1h); players often pick 2h. Used by the
-- "Add to calendar" event length.
ALTER TABLE public.sos_requests ADD COLUMN IF NOT EXISTS duration_min int NOT NULL DEFAULT 60;
