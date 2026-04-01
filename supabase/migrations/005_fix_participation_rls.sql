-- Fix infinite recursion in participation RLS policy
-- The SELECT policy was querying participation from within a participation policy,
-- causing Postgres to recurse infinitely.
-- Solution: use a SECURITY DEFINER function that bypasses RLS.

CREATE OR REPLACE FUNCTION is_hike_member(p_hike_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participation
    WHERE hike_id = p_hike_id
      AND user_id = auth.uid()
      AND status = 'confirmed'
  );
$$;

-- Drop the recursive policy and replace it
DROP POLICY IF EXISTS "Participations: lecture pour tous les authentifiés" ON participation;

CREATE POLICY "Participations: lecture pour les membres du groupe"
  ON participation FOR SELECT
  TO authenticated
  USING (is_hike_member(hike_id));
