-- ============================================================
-- Lacet — Migration 004 : Système de badges
-- ============================================================

CREATE TABLE IF NOT EXISTS user_badge (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  badge_id   text NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_badge_unique UNIQUE (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badge_user ON user_badge(user_id);

-- RLS : lecture publique (authentifié), écriture interdite côté client
ALTER TABLE user_badge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Badges: lecture authentifiée"
  ON user_badge FOR SELECT TO authenticated
  USING (true);
