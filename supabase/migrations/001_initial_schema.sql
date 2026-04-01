-- ============================================================
-- Lacet — Migration 001 : schéma initial
-- ============================================================

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS postgis;

-- ── Types ENUM ──
CREATE TYPE user_level AS ENUM ('easy', 'intermediate', 'hard', 'expert');
CREATE TYPE hike_status AS ENUM ('draft', 'open', 'full', 'completed', 'cancelled');
CREATE TYPE participation_role AS ENUM ('actor', 'volunteer');
CREATE TYPE participation_status AS ENUM ('confirmed', 'left', 'cancelled');
CREATE TYPE rating_context AS ENUM ('completed', 'left_early');

-- ── Table USER ──
CREATE TABLE "user" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,
  phone_verified boolean NOT NULL DEFAULT false,
  display_name  text NOT NULL,
  photo_url     text,
  birth_date    date NOT NULL,
  level         user_level NOT NULL DEFAULT 'easy',
  languages     text[] NOT NULL DEFAULT '{}',
  rating_avg    float NOT NULL DEFAULT 0,
  rating_count  integer NOT NULL DEFAULT 0,
  expo_push_token text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Table HIKE ──
CREATE TABLE hike (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id        uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  start_location    geography(Point, 4326) NOT NULL,
  gpx_url           text,
  distance_km       float NOT NULL,
  duration_min      integer NOT NULL,
  elevation_m       integer NOT NULL,
  level             user_level NOT NULL,
  date_start        date NOT NULL,
  date_flexible     boolean NOT NULL DEFAULT false,
  has_vehicle       boolean NOT NULL DEFAULT false,
  max_participants  integer NOT NULL,
  current_count     integer NOT NULL DEFAULT 0,
  status            hike_status NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hike_start_location_gist ON hike USING gist (start_location);
CREATE INDEX hike_status_idx ON hike (status);

-- ── Table PARTICIPATION ──
CREATE TABLE participation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  hike_id       uuid NOT NULL REFERENCES hike(id) ON DELETE CASCADE,
  role          participation_role NOT NULL,
  status        participation_status NOT NULL DEFAULT 'confirmed',
  joined_at     timestamptz NOT NULL DEFAULT now(),
  left_at       timestamptz,
  leave_reason  text
);

CREATE INDEX participation_user_idx ON participation (user_id);
CREATE INDEX participation_hike_idx ON participation (hike_id);

-- ── Table GROUP_MESSAGE ──
CREATE TABLE group_message (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hike_id     uuid NOT NULL REFERENCES hike(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  content     text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX group_message_hike_idx ON group_message (hike_id, sent_at);

-- ── Table RATING ──
CREATE TABLE rating (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hike_id       uuid NOT NULL REFERENCES hike(id) ON DELETE CASCADE,
  rater_id      uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  rated_id      uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  score         integer NOT NULL CHECK (score >= 1 AND score <= 5),
  context       rating_context NOT NULL,
  revealed      boolean NOT NULL DEFAULT false,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  revealed_at   timestamptz,

  CONSTRAINT rating_unique_per_pair UNIQUE (rater_id, rated_id, hike_id)
);

-- ============================================================
-- Triggers
-- ============================================================

-- ── Auto-update hike status on current_count change ──
CREATE OR REPLACE FUNCTION fn_hike_status_on_count()
RETURNS trigger AS $$
BEGIN
  IF NEW.current_count >= NEW.max_participants AND NEW.status = 'open' THEN
    NEW.status := 'full';
  ELSIF NEW.current_count < NEW.max_participants AND OLD.status = 'full' THEN
    NEW.status := 'open';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hike_status_on_count
  BEFORE UPDATE OF current_count ON hike
  FOR EACH ROW
  EXECUTE FUNCTION fn_hike_status_on_count();

-- ── Limit: max 3 active participations per volunteer ──
CREATE OR REPLACE FUNCTION fn_check_max_active_participations()
RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status = 'confirmed' THEN
    SELECT count(*) INTO active_count
    FROM participation
    WHERE user_id = NEW.user_id
      AND status = 'confirmed'
      AND role = 'volunteer';

    IF active_count >= 3 THEN
      RAISE EXCEPTION 'Un volontaire ne peut pas rejoindre plus de 3 randonnées simultanément.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_max_active_participations
  BEFORE INSERT ON participation
  FOR EACH ROW
  EXECUTE FUNCTION fn_check_max_active_participations();

-- ── Auto-increment / decrement current_count on participation changes ──
CREATE OR REPLACE FUNCTION fn_update_hike_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' THEN
    UPDATE hike SET current_count = current_count + 1 WHERE id = NEW.hike_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status != 'confirmed' THEN
    UPDATE hike SET current_count = current_count - 1 WHERE id = NEW.hike_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
    UPDATE hike SET current_count = current_count + 1 WHERE id = NEW.hike_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    UPDATE hike SET current_count = current_count - 1 WHERE id = OLD.hike_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_hike_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON participation
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_hike_count();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE hike ENABLE ROW LEVEL SECURITY;
ALTER TABLE participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating ENABLE ROW LEVEL SECURITY;

-- ── USER ──
CREATE POLICY "Users: lecture pour tous les authentifiés"
  ON "user" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users: modification de son propre profil"
  ON "user" FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users: insertion de son propre profil"
  ON "user" FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- ── HIKE ──
CREATE POLICY "Hikes: lecture des randos open ou full"
  ON hike FOR SELECT
  TO authenticated
  USING (status IN ('open', 'full') OR creator_id = auth.uid());

CREATE POLICY "Hikes: création par le creator"
  ON hike FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Hikes: modification par le creator"
  ON hike FOR UPDATE
  TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- ── PARTICIPATION ──
CREATE POLICY "Participations: lecture par les membres du groupe"
  ON participation FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participation p
      WHERE p.hike_id = participation.hike_id
        AND p.user_id = auth.uid()
        AND p.status = 'confirmed'
    )
  );

CREATE POLICY "Participations: insertion par soi-même"
  ON participation FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Participations: modification par soi-même"
  ON participation FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── GROUP_MESSAGE ──
CREATE POLICY "Messages: lecture/écriture par les membres confirmés"
  ON group_message FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participation p
      WHERE p.hike_id = group_message.hike_id
        AND p.user_id = auth.uid()
        AND p.status = 'confirmed'
    )
  );

CREATE POLICY "Messages: envoi par les membres confirmés"
  ON group_message FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM participation p
      WHERE p.hike_id = group_message.hike_id
        AND p.user_id = auth.uid()
        AND p.status = 'confirmed'
    )
  );

-- ── RATING ──
CREATE POLICY "Ratings: lecture avant révélation (rater uniquement)"
  ON rating FOR SELECT
  TO authenticated
  USING (
    rater_id = auth.uid()
    OR (revealed = true AND rated_id = auth.uid())
  );

CREATE POLICY "Ratings: création par le rater"
  ON rating FOR INSERT
  TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM participation p1
      JOIN participation p2 ON p1.hike_id = p2.hike_id
      JOIN hike h ON h.id = p1.hike_id
      WHERE p1.user_id = auth.uid()
        AND p2.user_id = rating.rated_id
        AND p1.status = 'confirmed'
        AND p2.status = 'confirmed'
        AND h.status = 'completed'
    )
  );

-- ── Activer Realtime sur group_message ──
ALTER PUBLICATION supabase_realtime ADD TABLE group_message;
