-- ============================================================
-- Lacet — Migration 006 : Révélation des notes
-- ============================================================

-- ── 1. Rendre sender_id nullable pour les messages système ──
ALTER TABLE group_message ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE group_message ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- ── 2. Fonction principale de révélation ──
-- Révèle toutes les notes d'une rando, met à jour les stats utilisateurs,
-- et envoie un message système dans le chat de groupe.

CREATE OR REPLACE FUNCTION fn_reveal_ratings(p_hike_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_avg float;
  v_count integer;
BEGIN
  -- Ne rien faire si déjà révélé
  IF EXISTS (SELECT 1 FROM rating WHERE hike_id = p_hike_id AND revealed = true) THEN
    RETURN;
  END IF;

  -- Révéler toutes les notes de cette rando
  UPDATE rating
  SET revealed = true, revealed_at = now()
  WHERE hike_id = p_hike_id AND revealed = false;

  -- Mettre à jour rating_avg et rating_count pour chaque personne notée
  FOR r IN (
    SELECT DISTINCT rated_id FROM rating WHERE hike_id = p_hike_id
  ) LOOP
    SELECT AVG(score::float), COUNT(*)
    INTO v_avg, v_count
    FROM rating
    WHERE rated_id = r.rated_id AND revealed = true;

    UPDATE "user"
    SET rating_avg = COALESCE(v_avg, 0),
        rating_count = v_count
    WHERE id = r.rated_id;
  END LOOP;

  -- Message système dans le chat de groupe
  INSERT INTO group_message (hike_id, sender_id, content, is_system)
  VALUES (
    p_hike_id,
    NULL,
    '🏆 Vos notes sont disponibles sur vos profils ! Vous avez formé un beau groupe — on espère vous revoir bientôt sur les sentiers.',
    true
  );
END;
$$;

-- ── 3. Trigger : révélation automatique quand tout le groupe a noté ──

CREATE OR REPLACE FUNCTION fn_check_reveal_on_rating_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_participants integer;
  v_total_raters       integer;
BEGIN
  -- Ignorer si la rando est déjà révélée
  IF EXISTS (SELECT 1 FROM rating WHERE hike_id = NEW.hike_id AND revealed = true) THEN
    RETURN NEW;
  END IF;

  -- Nombre de participants confirmés
  SELECT COUNT(*) INTO v_total_participants
  FROM participation
  WHERE hike_id = NEW.hike_id AND status = 'confirmed';

  -- Nombre de participants ayant soumis au moins une note
  SELECT COUNT(DISTINCT rater_id) INTO v_total_raters
  FROM rating
  WHERE hike_id = NEW.hike_id;

  -- Révéler si tout le monde a répondu
  IF v_total_raters >= v_total_participants THEN
    PERFORM fn_reveal_ratings(NEW.hike_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_reveal_on_rating ON rating;
CREATE TRIGGER trg_check_reveal_on_rating
  AFTER INSERT ON rating
  FOR EACH ROW
  EXECUTE FUNCTION fn_check_reveal_on_rating_insert();

-- ── 4. Fonction pour le cron 48h ──
-- À appeler via pg_cron ou Supabase Scheduler toutes les heures.
-- Révèle les notes des randos dont la fenêtre de notation a expiré (48h).

CREATE OR REPLACE FUNCTION fn_reveal_expired_ratings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT DISTINCT rt.hike_id
    FROM rating rt
    JOIN hike h ON h.id = rt.hike_id
    WHERE rt.revealed = false
      -- Fenêtre de notation ouverte depuis 48h
      AND (
        CASE
          WHEN h.duration_min > 1440 THEN
            (h.date_start::timestamptz
              + (h.duration_min || ' minutes')::interval
              + INTERVAL '24 hours'
              + INTERVAL '48 hours')
          ELSE
            (h.date_start::timestamptz
              + INTERVAL '24 hours'
              + INTERVAL '48 hours')
        END
      ) <= now()
  ) LOOP
    PERFORM fn_reveal_ratings(r.hike_id);
  END LOOP;
END;
$$;

-- ── 5. Activer pg_cron et planifier le job ──
-- (nécessite l'extension pg_cron activée dans Supabase Dashboard > Database > Extensions)

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'reveal-expired-ratings',   -- nom du job
  '0 * * * *',                -- toutes les heures
  'SELECT fn_reveal_expired_ratings()'
);

-- ── 6. RLS : permettre la lecture des messages système (sender_id NULL) ──
DROP POLICY IF EXISTS "Messages: lecture par les membres" ON group_message;
CREATE POLICY "Messages: lecture par les membres"
  ON group_message FOR SELECT TO authenticated
  USING (
    is_system = true
    OR is_hike_member(hike_id)
  );
