-- Add sharing and invite functionality to households

-- Add public sharing columns to households
ALTER TABLE households ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE households ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT uuid_generate_v4();

-- Create index on share_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_households_share_token ON households(share_token);

-- Household invites table
CREATE TABLE IF NOT EXISTS household_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token UUID DEFAULT uuid_generate_v4(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, email)
);

-- Index for invite lookups
CREATE INDEX IF NOT EXISTS idx_household_invites_token ON household_invites(token);
CREATE INDEX IF NOT EXISTS idx_household_invites_email ON household_invites(email);

-- Enable RLS on invites
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for household_invites

-- Users can view invites for their households
CREATE POLICY "Users can view household invites" ON household_invites
  FOR SELECT USING (
    household_id IN (SELECT get_user_household_ids(auth.uid()))
  );

-- Owners can create invites
CREATE POLICY "Owners can create invites" ON household_invites
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Owners can delete invites
CREATE POLICY "Owners can delete invites" ON household_invites
  FOR DELETE USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Users can update invites they've been sent (to accept them)
CREATE POLICY "Users can accept their invites" ON household_invites
  FOR UPDATE USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Public access policies for households
-- Allow anyone to view public households via share token
CREATE POLICY "Anyone can view public households" ON households
  FOR SELECT USING (is_public = true);

-- Drop and recreate storage_units select policy to include public access
DROP POLICY IF EXISTS "Users can view storage units" ON storage_units;
CREATE POLICY "Users can view storage units" ON storage_units
  FOR SELECT USING (
    household_id IN (SELECT get_user_household_ids(auth.uid()))
    OR household_id IN (SELECT id FROM households WHERE is_public = true)
  );

-- Drop and recreate shelves select policy to include public access
DROP POLICY IF EXISTS "Users can view shelves" ON shelves;
CREATE POLICY "Users can view shelves" ON shelves
  FOR SELECT USING (
    storage_unit_id IN (
      SELECT id FROM storage_units WHERE household_id IN (
        SELECT get_user_household_ids(auth.uid())
      )
    )
    OR storage_unit_id IN (
      SELECT id FROM storage_units WHERE household_id IN (
        SELECT id FROM households WHERE is_public = true
      )
    )
  );

-- Drop and recreate items select policy to include public access
DROP POLICY IF EXISTS "Users can view items" ON items;
CREATE POLICY "Users can view items" ON items
  FOR SELECT USING (
    household_id IN (SELECT get_user_household_ids(auth.uid()))
    OR household_id IN (SELECT id FROM households WHERE is_public = true)
  );

-- Drop and recreate inventory select policy to include public access
DROP POLICY IF EXISTS "Users can view inventory" ON inventory;
CREATE POLICY "Users can view inventory" ON inventory
  FOR SELECT USING (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT get_user_household_ids(auth.uid())
      )
    )
    OR item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT id FROM households WHERE is_public = true
      )
    )
  );

-- Drop and recreate stores select policy to include public access
DROP POLICY IF EXISTS "Users can view stores" ON stores;
CREATE POLICY "Users can view stores" ON stores
  FOR SELECT USING (
    household_id IN (SELECT get_user_household_ids(auth.uid()))
    OR household_id IN (SELECT id FROM households WHERE is_public = true)
  );

-- Drop and recreate price_history select policy to include public access
DROP POLICY IF EXISTS "Users can view price history" ON price_history;
CREATE POLICY "Users can view price history" ON price_history
  FOR SELECT USING (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT get_user_household_ids(auth.uid())
      )
    )
    OR item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT id FROM households WHERE is_public = true
      )
    )
  );

-- Function to accept an invite
CREATE OR REPLACE FUNCTION accept_household_invite(invite_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite household_invites%ROWTYPE;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- Find the invite
  SELECT * INTO v_invite FROM household_invites
  WHERE token = invite_token
  AND accepted_at IS NULL
  AND expires_at > NOW();

  IF v_invite IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found or expired');
  END IF;

  -- Check if email matches
  IF v_invite.email != v_user_email THEN
    RETURN json_build_object('success', false, 'error', 'This invite is for a different email address');
  END IF;

  -- Check if already a member
  IF EXISTS (SELECT 1 FROM household_members WHERE household_id = v_invite.household_id AND user_id = v_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already a member of this household');
  END IF;

  -- Add user to household
  INSERT INTO household_members (household_id, user_id, role, invited_by)
  VALUES (v_invite.household_id, v_user_id, v_invite.role, v_invite.invited_by);

  -- Mark invite as accepted
  UPDATE household_invites SET accepted_at = NOW() WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'household_id', v_invite.household_id);
END;
$$;
