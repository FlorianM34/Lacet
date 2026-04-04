-- ============================================================
-- Migration 012 : Suivi des messages non lus
-- ============================================================

CREATE TABLE IF NOT EXISTS group_read_status (
  user_id      uuid NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  hike_id      uuid NOT NULL REFERENCES hike(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hike_id)
);

CREATE INDEX IF NOT EXISTS idx_read_status_user ON group_read_status(user_id);

ALTER TABLE group_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read status: accès par le propriétaire"
  ON group_read_status FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
