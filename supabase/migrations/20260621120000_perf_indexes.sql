-- Iteration 0 (0.2): secondary indexes on hot paths.
-- Until now the schema had ZERO secondary indexes; every SOS match / game
-- lookup / expiry sweep was a sequential scan. Invisible at ~80 users, a wall
-- at city scale. All additive, idempotent, no behaviour change.

-- sos_requests: matching engine + expiry filter by (status, kind, play_at)
CREATE INDEX IF NOT EXISTS idx_sos_status_kind_playat
  ON public.sos_requests (status, kind, play_at);

-- sos_requests: "my SOS" / active_sos_count(caller)
CREATE INDEX IF NOT EXISTS idx_sos_caller
  ON public.sos_requests (caller_id);

-- sos_requests: fetchMyUpcomingClaims / claim lookups
CREATE INDEX IF NOT EXISTS idx_sos_claimed_by
  ON public.sos_requests (claimed_by);

-- games: home/board "my games" = OR(player_a, player_b) + played_at range/sort.
-- Two single-column-leading composites let the planner BitmapOr them.
CREATE INDEX IF NOT EXISTS idx_games_player_a_playedat
  ON public.games (player_a, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_player_b_playedat
  ON public.games (player_b, played_at DESC);

-- games: stats join sos -> games
CREATE INDEX IF NOT EXISTS idx_games_sos
  ON public.games (sos_id);

-- NOTE: event_attendees already has UNIQUE(event_id, user_id); event_id is the
-- leftmost column so lookups by event_id are already covered. No extra index.
