-- ============================================================
-- Migration 010 : Évaluation des badges en SQL pur
-- Remplace la dépendance edge function + pg_net + vault
-- Trigger direct sur hike → status = 'completed'
-- ============================================================

-- ── 1. Évalue et attribue les badges d'un utilisateur ──
-- Calcule ses stats sur toutes ses randos terminées,
-- insère les nouveaux badges gagnés (ON CONFLICT ignore les doublons).

CREATE OR REPLACE FUNCTION fn_evaluate_badges_for_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_km        float;
  v_total_hikes     integer;
  v_total_organized integer;

  -- Définitions des badges (miroir de lib/badges.ts)
  v_badge_ids   text[]  := ARRAY['distance_bronze','distance_silver','distance_gold',
                                  'hikes_bronze','hikes_silver','hikes_gold',
                                  'orga_bronze','orga_silver','orga_gold'];
  v_thresholds  float[] := ARRAY[50, 200, 500, 1, 10, 30, 1, 5, 15];
  v_families    text[]  := ARRAY['distance','distance','distance',
                                  'hikes','hikes','hikes',
                                  'organizer','organizer','organizer'];
  i      integer;
  v_stat float;
BEGIN
  -- Stats sur randos confirmées et terminées
  SELECT
    COALESCE(SUM(CASE WHEN p.role = 'volunteer' THEN h.distance_km ELSE 0 END), 0),
    COUNT(CASE WHEN p.role = 'volunteer' THEN 1 END),
    COUNT(CASE WHEN p.role = 'actor'    THEN 1 END)
  INTO v_total_km, v_total_hikes, v_total_organized
  FROM participation p
  JOIN hike h ON h.id = p.hike_id
  WHERE p.user_id = p_user_id
    AND p.status  = 'confirmed'
    AND h.status  = 'completed';

  -- Tester chaque badge
  FOR i IN 1..array_length(v_badge_ids, 1) LOOP
    v_stat := CASE v_families[i]
      WHEN 'distance'  THEN v_total_km
      WHEN 'hikes'     THEN v_total_hikes::float
      WHEN 'organizer' THEN v_total_organized::float
    END;

    IF v_stat >= v_thresholds[i] THEN
      INSERT INTO user_badge (user_id, badge_id)
      VALUES (p_user_id, v_badge_ids[i])
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ── 2. Évalue les badges pour tous les participants d'une rando ──

CREATE OR REPLACE FUNCTION fn_evaluate_badges_for_hike(p_hike_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT user_id
    FROM participation
    WHERE hike_id = p_hike_id
      AND status  = 'confirmed'
  ) LOOP
    PERFORM fn_evaluate_badges_for_user(r.user_id);
  END LOOP;
END;
$$;

-- ── 3. Trigger : déclenché quand une rando passe à 'completed' ──

CREATE OR REPLACE FUNCTION fn_trigger_badges_on_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM fn_evaluate_badges_for_hike(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_badges_on_completion ON hike;
CREATE TRIGGER trg_badges_on_completion
  AFTER UPDATE ON hike
  FOR EACH ROW
  EXECUTE FUNCTION fn_trigger_badges_on_completion();
