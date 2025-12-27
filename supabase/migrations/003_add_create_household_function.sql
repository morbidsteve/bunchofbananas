-- Function to create a household and add the creator as owner atomically
CREATE OR REPLACE FUNCTION create_household_with_owner(household_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id UUID;
  current_user_id UUID;
BEGIN
  -- Get the current user's ID
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create the household
  INSERT INTO households (name)
  VALUES (household_name)
  RETURNING id INTO new_household_id;

  -- Add the user as owner
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (new_household_id, current_user_id, 'owner');

  RETURN new_household_id;
END;
$$;
