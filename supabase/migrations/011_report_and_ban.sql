-- ============================================================
-- Migration 011 : Signalement et bannissement
-- ============================================================

-- ── 1. Champ is_banned sur user ──
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- ── 2. Table report ──
CREATE TABLE IF NOT EXISTS report (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_no_self CHECK (reporter_id <> reported_id),
  CONSTRAINT report_unique  UNIQUE (reporter_id, reported_id)
);

CREATE INDEX IF NOT EXISTS idx_report_reported ON report(reported_id);

-- ── 3. RLS : seul l'auteur peut insérer, lecture interdite côté client ──
ALTER TABLE report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Report: insert par utilisateur authentifié"
  ON report FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
