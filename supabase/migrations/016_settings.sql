-- ============================================================
-- Migration 016 : Paramètres utilisateur
-- ============================================================

ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{
    "new_member": true,
    "new_message": true,
    "group_full": true,
    "reminder": false,
    "rating": true
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Les utilisateurs supprimés ne peuvent plus lire leur propre profil
-- (ils sont déjà déconnectés via auth.admin.deleteUser, mais par sécurité)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user' AND policyname = 'Block deleted users'
  ) THEN
    EXECUTE 'CREATE POLICY "Block deleted users" ON public."user" AS RESTRICTIVE FOR ALL USING (is_deleted = false)';
  END IF;
END $$;
