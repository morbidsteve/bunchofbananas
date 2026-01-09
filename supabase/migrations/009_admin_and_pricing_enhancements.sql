-- Migration: Admin and Pricing Enhancements
-- Adds:
-- 1. Function to get household members with emails
-- 2. Function to update member roles
-- 3. Package size fields for normalized price-per-unit calculations

-- ==========================================
-- 1. View/Function to get member emails
-- ==========================================

-- Create a security definer function that can access auth.users
-- This allows fetching user emails for household members
CREATE OR REPLACE FUNCTION get_household_members_with_emails(p_household_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is a member of this household
  IF NOT EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.household_id = p_household_id
    AND hm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this household''s members';
  END IF;

  RETURN QUERY
  SELECT
    hm.id,
    hm.user_id,
    u.email::TEXT,
    hm.role::TEXT,
    hm.created_at
  FROM household_members hm
  JOIN auth.users u ON u.id = hm.user_id
  WHERE hm.household_id = p_household_id
  ORDER BY hm.created_at ASC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_household_members_with_emails(UUID) TO authenticated;

-- ==========================================
-- 2. Function to update member role
-- ==========================================

CREATE OR REPLACE FUNCTION update_member_role(
  p_member_id UUID,
  p_new_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_target_user_id UUID;
BEGIN
  -- Validate role
  IF p_new_role NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Invalid role. Must be owner or member';
  END IF;

  -- Get the household_id and target user from the member record
  SELECT household_id, user_id INTO v_household_id, v_target_user_id
  FROM household_members
  WHERE id = p_member_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Verify caller is an owner of this household
  IF NOT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = v_household_id
    AND user_id = auth.uid()
    AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owners can change member roles';
  END IF;

  -- Prevent removing the last owner
  IF p_new_role = 'member' THEN
    IF (
      SELECT COUNT(*) FROM household_members
      WHERE household_id = v_household_id
      AND role = 'owner'
      AND id != p_member_id
    ) = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last owner';
    END IF;
  END IF;

  -- Update the role
  UPDATE household_members
  SET role = p_new_role
  WHERE id = p_member_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_member_role(UUID, TEXT) TO authenticated;

-- ==========================================
-- 3. Package size fields for price tracking
-- ==========================================

-- Add package_size and package_unit to price_history for tracking actual package contents
-- This allows calculating normalized price per standard unit
ALTER TABLE price_history
ADD COLUMN IF NOT EXISTS package_size DECIMAL,
ADD COLUMN IF NOT EXISTS package_unit TEXT;

-- Add comment explaining the fields
COMMENT ON COLUMN price_history.package_size IS 'Total size/weight of the package (e.g., 16 for a 16oz bag)';
COMMENT ON COLUMN price_history.package_unit IS 'Unit of the package size for normalization (oz, lb, ml, L, g, kg, fl_oz, count)';

-- Create an index to help with price comparison queries
CREATE INDEX IF NOT EXISTS idx_price_history_package ON price_history(item_id, package_unit) WHERE package_size IS NOT NULL;

-- ==========================================
-- 4. Helper function for unit conversion
-- ==========================================

-- Function to convert between common units to a base unit for comparison
CREATE OR REPLACE FUNCTION convert_to_base_unit(
  p_value DECIMAL,
  p_unit TEXT
)
RETURNS TABLE (
  base_value DECIMAL,
  base_unit TEXT
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Weight conversions (base: oz)
  IF p_unit = 'oz' THEN
    RETURN QUERY SELECT p_value, 'oz'::TEXT;
  ELSIF p_unit = 'lb' THEN
    RETURN QUERY SELECT p_value * 16, 'oz'::TEXT;
  ELSIF p_unit = 'g' THEN
    RETURN QUERY SELECT p_value * 0.035274, 'oz'::TEXT;
  ELSIF p_unit = 'kg' THEN
    RETURN QUERY SELECT p_value * 35.274, 'oz'::TEXT;
  -- Volume conversions (base: fl_oz)
  ELSIF p_unit = 'fl_oz' THEN
    RETURN QUERY SELECT p_value, 'fl_oz'::TEXT;
  ELSIF p_unit = 'ml' THEN
    RETURN QUERY SELECT p_value * 0.033814, 'fl_oz'::TEXT;
  ELSIF p_unit = 'L' OR p_unit = 'liter' THEN
    RETURN QUERY SELECT p_value * 33.814, 'fl_oz'::TEXT;
  ELSIF p_unit = 'gallon' THEN
    RETURN QUERY SELECT p_value * 128, 'fl_oz'::TEXT;
  ELSIF p_unit = 'quart' THEN
    RETURN QUERY SELECT p_value * 32, 'fl_oz'::TEXT;
  ELSIF p_unit = 'pint' THEN
    RETURN QUERY SELECT p_value * 16, 'fl_oz'::TEXT;
  ELSIF p_unit = 'cup' THEN
    RETURN QUERY SELECT p_value * 8, 'fl_oz'::TEXT;
  -- Count-based (no conversion needed)
  ELSE
    RETURN QUERY SELECT p_value, p_unit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION convert_to_base_unit(DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION convert_to_base_unit(DECIMAL, TEXT) TO anon;
