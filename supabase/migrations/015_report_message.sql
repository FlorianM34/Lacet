-- ============================================================
-- Migration 015 : Ajout d'un message optionnel au signalement
-- ============================================================

ALTER TABLE report ADD COLUMN IF NOT EXISTS message text;
