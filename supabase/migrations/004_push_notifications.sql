-- ============================================================
-- Lacet — Migration 004 : Push notifications (triggers + pg_cron)
-- ============================================================

-- Requires pg_net and pg_cron extensions (available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Helper: call send-push Edge Function via pg_net ──

CREATE OR REPLACE FUNCTION fn_call_send_push(
  push_token text,
  push_title text,
  push_body text,
  push_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_url text;
  service_key text;
BEGIN
  IF push_token IS NULL OR push_token = '' THEN
    RETURN;
  END IF;

  edge_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push';
  service_key := current_setting('app.settings.service_role_key', true);

  -- If settings are not available, build from env
  IF edge_url IS NULL OR edge_url = '' THEN
    RETURN; -- silently skip if not configured
  END IF;

  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'to', push_token,
      'title', push_title,
      'body', push_body,
      'data', push_data
    )
  );
END;
$$;

-- Helper: send push to multiple tokens
CREATE OR REPLACE FUNCTION fn_call_send_push_multi(
  push_tokens text[],
  push_title text,
  push_body text,
  push_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_url text;
  service_key text;
  valid_tokens text[];
BEGIN
  -- Filter out NULL/empty tokens
  SELECT array_agg(t) INTO valid_tokens
  FROM unnest(push_tokens) t
  WHERE t IS NOT NULL AND t != '';

  IF valid_tokens IS NULL OR array_length(valid_tokens, 1) = 0 THEN
    RETURN;
  END IF;

  edge_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push';
  service_key := current_setting('app.settings.service_role_key', true);

  IF edge_url IS NULL OR edge_url = '' THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'to', to_jsonb(valid_tokens),
      'title', push_title,
      'body', push_body,
      'data', push_data
    )
  );
END;
$$;

-- ============================================================
-- Trigger 1: Nouveau match (insertion PARTICIPATION role=volunteer)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_notify_new_match()
RETURNS trigger AS $$
DECLARE
  hike_title text;
  volunteer_name text;
  creator_token text;
  creator_id uuid;
BEGIN
  IF NEW.role != 'volunteer' OR NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT h.title, h.creator_id INTO hike_title, creator_id
  FROM hike h WHERE h.id = NEW.hike_id;

  SELECT display_name INTO volunteer_name
  FROM "user" WHERE id = NEW.user_id;

  SELECT expo_push_token INTO creator_token
  FROM "user" WHERE id = creator_id;

  PERFORM fn_call_send_push(
    creator_token,
    'Nouveau randonneur !',
    volunteer_name || ' rejoint « ' || hike_title || ' »',
    jsonb_build_object('type', 'new_match', 'hike_id', NEW.hike_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_new_match
  AFTER INSERT ON participation
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_new_match();

-- ============================================================
-- Trigger 2: Nouveau message dans le chat
-- ============================================================

CREATE OR REPLACE FUNCTION fn_notify_new_message()
RETURNS trigger AS $$
DECLARE
  sender_name text;
  hike_title text;
  member_tokens text[];
  msg_preview text;
BEGIN
  SELECT display_name INTO sender_name
  FROM "user" WHERE id = NEW.sender_id;

  SELECT title INTO hike_title
  FROM hike WHERE id = NEW.hike_id;

  -- Get push tokens of all confirmed members except sender
  SELECT array_agg(u.expo_push_token) INTO member_tokens
  FROM participation p
  JOIN "user" u ON u.id = p.user_id
  WHERE p.hike_id = NEW.hike_id
    AND p.status = 'confirmed'
    AND p.user_id != NEW.sender_id
    AND u.expo_push_token IS NOT NULL;

  -- Truncate message preview
  msg_preview := left(NEW.content, 100);
  -- If it's a JSON RDV message, show a simpler preview
  IF left(NEW.content, 1) = '{' THEN
    msg_preview := 'a partagé un point de rendez-vous';
  END IF;

  PERFORM fn_call_send_push_multi(
    member_tokens,
    hike_title,
    sender_name || ' : ' || msg_preview,
    jsonb_build_object('type', 'new_message', 'hike_id', NEW.hike_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON group_message
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_new_message();

-- ============================================================
-- Trigger 3: Groupe complet (hike.status → 'full')
-- ============================================================

CREATE OR REPLACE FUNCTION fn_notify_group_full()
RETURNS trigger AS $$
DECLARE
  creator_token text;
BEGIN
  IF NEW.status = 'full' AND OLD.status != 'full' THEN
    SELECT expo_push_token INTO creator_token
    FROM "user" WHERE id = NEW.creator_id;

    PERFORM fn_call_send_push(
      creator_token,
      'Groupe complet !',
      'Votre rando « ' || NEW.title || ' » est complète. Tous les participants sont confirmés.',
      jsonb_build_object('type', 'group_full', 'hike_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_group_full
  AFTER UPDATE OF status ON hike
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_group_full();

-- ============================================================
-- pg_cron Job 4: Rappel J-1 (chaque jour à 18h UTC)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_send_reminder_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec record;
  member_tokens text[];
BEGIN
  FOR rec IN
    SELECT h.id, h.title, h.date_start
    FROM hike h
    WHERE h.date_start = CURRENT_DATE + INTERVAL '1 day'
      AND h.status IN ('open', 'full')
  LOOP
    SELECT array_agg(u.expo_push_token) INTO member_tokens
    FROM participation p
    JOIN "user" u ON u.id = p.user_id
    WHERE p.hike_id = rec.id
      AND p.status = 'confirmed'
      AND u.expo_push_token IS NOT NULL;

    PERFORM fn_call_send_push_multi(
      member_tokens,
      'Rappel : rando demain !',
      '« ' || rec.title || ' » a lieu demain. Préparez vos chaussures !',
      jsonb_build_object('type', 'reminder', 'hike_id', rec.id)
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'daily-hike-reminder',
  '0 18 * * *',
  $$SELECT fn_send_reminder_notifications()$$
);

-- ============================================================
-- pg_cron Job 5: Ouverture notation J+1 (chaque jour à 10h UTC)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_send_rating_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec record;
  member_tokens text[];
BEGIN
  -- Find hikes that ended yesterday and mark them as completed
  UPDATE hike
  SET status = 'completed'
  WHERE date_start = CURRENT_DATE - INTERVAL '1 day'
    AND status IN ('open', 'full');

  FOR rec IN
    SELECT h.id, h.title
    FROM hike h
    WHERE h.date_start = CURRENT_DATE - INTERVAL '1 day'
      AND h.status = 'completed'
  LOOP
    SELECT array_agg(u.expo_push_token) INTO member_tokens
    FROM participation p
    JOIN "user" u ON u.id = p.user_id
    WHERE p.hike_id = rec.id
      AND p.status = 'confirmed'
      AND u.expo_push_token IS NOT NULL;

    PERFORM fn_call_send_push_multi(
      member_tokens,
      'Comment s''est passée la rando ?',
      'Notez vos compagnons de « ' || rec.title || ' ». Les notes seront révélées quand tout le monde aura voté.',
      jsonb_build_object('type', 'rating', 'hike_id', rec.id)
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'daily-rating-open',
  '0 10 * * *',
  $$SELECT fn_send_rating_notifications()$$
);
