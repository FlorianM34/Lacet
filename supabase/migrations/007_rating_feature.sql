-- ============================================================
-- Lacet — Migration 007 : Système de notation robuste
-- ============================================================
--
-- Prérequis : exécuter ces deux commandes UNE FOIS dans le SQL Editor
-- avec tes valeurs (Dashboard > Settings > API) :
--
--   ALTER DATABASE postgres SET "app.supabase_url"         TO 'https://XXX.supabase.co';
--   ALTER DATABASE postgres SET "app.supabase_service_key" TO 'service_role_key_ici';
--
-- ============================================================

-- ── 1. Extensions ──
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 2. Colonnes idempotentes sur hike ──
ALTER TABLE hike
  ADD COLUMN IF NOT EXISTS rating_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by        uuid REFERENCES auth.users(id);

-- ── 3. Trigger : appeler send-rating-bot quand status → completed ──
--    Condition exacte : OLD.rating_triggered_at IS NULL
--                   AND NEW.rating_triggered_at IS NOT NULL
--    => déclenché une seule fois, même si le cron et le bouton arrivent simultanément

CREATE OR REPLACE FUNCTION fn_trigger_rating_on_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NEW.status = 'completed'
     AND OLD.rating_triggered_at IS NULL
     AND NEW.rating_triggered_at IS NOT NULL
  THEN
    v_url := current_setting('app.supabase_url', true);
    v_key := current_setting('app.supabase_service_key', true);

    IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/send-rating-bot',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object('hike_id', NEW.id::text)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rating_on_completion ON hike;
CREATE TRIGGER trg_rating_on_completion
  AFTER UPDATE ON hike
  FOR EACH ROW
  EXECUTE FUNCTION fn_trigger_rating_on_completion();

-- ── 4. Cron : compléter les randos terminées depuis 24h ──
DO $$ BEGIN PERFORM cron.unschedule('complete-ended-hikes'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'complete-ended-hikes',
  '0 * * * *',
  $$
    UPDATE hike
    SET status              = 'completed',
        rating_triggered_at = now()
    WHERE status IN ('open', 'full')
      AND rating_triggered_at IS NULL
      AND (date_start::timestamptz
           + (duration_min || ' minutes')::interval
           + INTERVAL '24 hours') < now()
  $$
);

-- ── 5. Trigger sur rating : appeler reveal-ratings après chaque insertion ──

CREATE OR REPLACE FUNCTION fn_trigger_reveal_on_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  v_url := current_setting('app.supabase_url', true);
  v_key := current_setting('app.supabase_service_key', true);

  IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/reveal-ratings',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('hike_id', NEW.hike_id::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reveal_on_rating ON rating;
CREATE TRIGGER trg_reveal_on_rating
  AFTER INSERT ON rating
  FOR EACH ROW
  EXECUTE FUNCTION fn_trigger_reveal_on_rating();

-- ── 6. Fonction wrapper pour le cron de révélation ──

CREATE OR REPLACE FUNCTION fn_cron_reveal_expired_ratings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r   record;
  v_url text;
  v_key text;
BEGIN
  v_url := current_setting('app.supabase_url', true);
  v_key := current_setting('app.supabase_service_key', true);
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;

  FOR r IN (
    SELECT DISTINCT h.id
    FROM hike h
    JOIN rating rt ON rt.hike_id = h.id
    WHERE rt.revealed = false
      AND h.status = 'completed'
      AND h.rating_triggered_at IS NOT NULL
      AND h.rating_triggered_at < now() - INTERVAL '47 hours'
  ) LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/reveal-ratings',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('hike_id', r.id::text)
    );
  END LOOP;
END;
$$;

DO $$ BEGIN PERFORM cron.unschedule('reveal-expired-ratings'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'reveal-expired-ratings',
  '0 * * * *',
  'SELECT fn_cron_reveal_expired_ratings()'
);

-- ── 7. RLS mise à jour ──
-- Un utilisateur peut lire :
--   - ses propres notes soumises (rater)
--   - ses notes révélées reçues (rated)
DROP POLICY IF EXISTS "Ratings: lecture"             ON rating;
DROP POLICY IF EXISTS "Ratings: lecture par le rater ou rated révélé" ON rating;
CREATE POLICY "Ratings: lecture par le rater ou rated révélé"
  ON rating FOR SELECT TO authenticated
  USING (
    rater_id = auth.uid()
    OR (revealed = true AND rated_id = auth.uid())
  );
