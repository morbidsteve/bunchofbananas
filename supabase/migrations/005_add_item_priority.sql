-- Add priority and condition notes to inventory table
-- Priority allows users to mark items that need to be used soon

-- Create enum for priority levels
DO $$ BEGIN
  CREATE TYPE item_priority AS ENUM ('normal', 'use_soon', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add priority and condition_notes columns to inventory
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS priority item_priority DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS condition_notes text;

-- Create index for quickly finding priority items
CREATE INDEX IF NOT EXISTS idx_inventory_priority ON inventory(priority) WHERE priority != 'normal';

-- Add comment for documentation
COMMENT ON COLUMN inventory.priority IS 'Priority level for the item - normal, use_soon, or urgent';
COMMENT ON COLUMN inventory.condition_notes IS 'Notes about the item condition (e.g., "getting mushy", "almost expired")';
