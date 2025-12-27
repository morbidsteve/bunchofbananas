-- Fix infinite recursion in household_members RLS policies
-- The original SELECT policy queried household_members to check access to household_members

-- Create a security definer function to get user's household IDs without RLS checks
CREATE OR REPLACE FUNCTION get_user_household_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT household_id FROM household_members WHERE user_id = uid;
$$;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Users can view household members" ON household_members;
DROP POLICY IF EXISTS "Owners can manage members" ON household_members;

-- Recreate policies using the security definer function
CREATE POLICY "Users can view household members" ON household_members
  FOR SELECT USING (
    household_id IN (SELECT get_user_household_ids(auth.uid()))
  );

CREATE POLICY "Owners can manage members" ON household_members
  FOR DELETE USING (
    household_id IN (SELECT get_user_household_ids(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM household_members
      WHERE household_id = household_members.household_id
      AND user_id = auth.uid()
      AND role = 'owner'
    )
  );
