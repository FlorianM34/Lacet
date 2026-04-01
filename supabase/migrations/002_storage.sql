-- ============================================================
-- Lacet — Migration 002 : buckets Storage
-- ============================================================

-- Bucket privé pour les fichiers GPX
INSERT INTO storage.buckets (id, name, public)
VALUES ('gpx-files', 'gpx-files', false);

-- Bucket public pour les photos de profil
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true);

-- ── Policies Storage : gpx-files ──

CREATE POLICY "GPX: upload par les authentifiés"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'gpx-files');

CREATE POLICY "GPX: lecture par les authentifiés"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'gpx-files');

-- ── Policies Storage : profile-photos ──

CREATE POLICY "Photos: lecture publique"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-photos');

CREATE POLICY "Photos: upload par les authentifiés"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'profile-photos');

CREATE POLICY "Photos: modification de ses propres photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Photos: suppression de ses propres photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
