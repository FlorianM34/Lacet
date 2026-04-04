-- ============================================================
-- Migration 009 : Triggers qui lisent URL + clé depuis le Vault
-- Prérequis : ajouter le secret dans Supabase Dashboard
--   Database > Vault > Add secret
--   name  : supabase_service_role_key
--   value : ta service_role key (Settings > API)
-- ============================================================

-- ── Trigger : hike → completed ──
CREATE OR REPLACE FUNCTION fn_trigger_rating_on_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
BEGIN
  IF NEW.status = 'completed'
     AND OLD.rating_triggered_at IS NULL
     AND NEW.rating_triggered_at IS NOT NULL
  THEN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_service_role_key'
    LIMIT 1;

    IF v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := 'https://rwpyybpqipcgiisgajhk.supabase.co/functions/v1/send-rating-bot',
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

-- ── Trigger : après chaque INSERT sur rating ──
CREATE OR REPLACE FUNCTION fn_trigger_reveal_on_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  IF v_key IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://rwpyybpqipcgiisgajhk.supabase.co/functions/v1/reveal-ratings',
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

-- ── Cron : révélation des notes expirées ──
CREATE OR REPLACE FUNCTION fn_cron_reveal_expired_ratings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r     record;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN RETURN; END IF;

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
      url     := 'https://rwpyybpqipcgiisgajhk.supabase.co/functions/v1/reveal-ratings',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('hike_id', r.id::text)
    );
  END LOOP;
END;
$$;
