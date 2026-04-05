-- ============================================================
-- Migration 013 : Stockage du tracé GPX sur la randonnée
-- ============================================================

ALTER TABLE hike ADD COLUMN IF NOT EXISTS route_coordinates jsonb;
