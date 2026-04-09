-- ============================================================
-- Migration 017 : Validation manuelle — partie 1 (enum + colonne)
-- ============================================================
-- NOTE: Ce fichier doit committer avant la migration 018 qui utilise
-- la nouvelle valeur 'pending' de l'enum.

-- 1. Colonne auto_accept sur la table hike
ALTER TABLE hike ADD COLUMN IF NOT EXISTS auto_accept boolean NOT NULL DEFAULT true;

-- 2. Valeur 'pending' dans l'enum participation_status
-- IMPORTANT: Doit être dans une transaction séparée de l'index qui utilise 'pending'
ALTER TYPE participation_status ADD VALUE IF NOT EXISTS 'pending';
