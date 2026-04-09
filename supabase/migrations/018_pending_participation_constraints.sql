-- ============================================================
-- Migration 018 : Validation manuelle — partie 2 (index, trigger, RLS)
-- ============================================================
-- Dépend de 017 : la valeur 'pending' de participation_status doit
-- déjà exister (dans une transaction committée) avant ce fichier.

-- 1. Index unique pour éviter les doublons actifs (pending + confirmed) par rando
CREATE UNIQUE INDEX IF NOT EXISTS participation_active_unique
  ON participation (user_id, hike_id)
  WHERE status IN ('pending', 'confirmed');

-- 2. Mise à jour du trigger de limitation (pending compte comme actif)
CREATE OR REPLACE FUNCTION fn_check_max_active_participations()
RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status IN ('confirmed', 'pending') AND NEW.role = 'volunteer' THEN
    SELECT count(*) INTO active_count
    FROM participation
    WHERE user_id = NEW.user_id
      AND status IN ('confirmed', 'pending')
      AND role = 'volunteer'
      AND id IS DISTINCT FROM NEW.id;
    IF active_count >= 3 THEN
      RAISE EXCEPTION 'Un volontaire ne peut pas rejoindre plus de 3 randonnées simultanément.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Fonction SECURITY DEFINER : vérifie si auth.uid() est le créateur d'une rando
-- Même pattern que is_hike_member() — bypass RLS pour éviter toute récursion indirecte
CREATE OR REPLACE FUNCTION is_hike_creator(p_hike_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM hike
    WHERE id = p_hike_id
      AND creator_id = auth.uid()
  );
$$;

-- 4. RLS SELECT : l'utilisateur peut lire ses propres participations (quel que soit le statut)
-- Remplace l'ancienne version si elle existait sans SECURITY DEFINER
DROP POLICY IF EXISTS "Participations: lecture de ses propres lignes" ON participation;
CREATE POLICY "Participations: lecture de ses propres lignes"
  ON participation FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 5. RLS SELECT : l'acteur peut lire toutes les participations de ses randos (y compris pending)
-- is_hike_creator est SECURITY DEFINER → bypass RLS sur hike → pas de récursion
DROP POLICY IF EXISTS "Participations: lecture par l'acteur de la rando" ON participation;
CREATE POLICY "Participations: lecture par l'acteur de la rando"
  ON participation FOR SELECT
  TO authenticated
  USING (is_hike_creator(hike_id));

-- 6. RLS UPDATE : l'acteur peut modifier le statut des participations de ses randos
DROP POLICY IF EXISTS "Participations: modification par l'acteur" ON participation;
CREATE POLICY "Participations: modification par l'acteur"
  ON participation FOR UPDATE
  TO authenticated
  USING (is_hike_creator(hike_id));
