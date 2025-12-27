-- Add nutrition fields to items table
-- These fields are populated from barcode scanning / product lookup

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS calories decimal,
  ADD COLUMN IF NOT EXISTS protein_g decimal,
  ADD COLUMN IF NOT EXISTS carbs_g decimal,
  ADD COLUMN IF NOT EXISTS fat_g decimal,
  ADD COLUMN IF NOT EXISTS fiber_g decimal,
  ADD COLUMN IF NOT EXISTS sugar_g decimal,
  ADD COLUMN IF NOT EXISTS sodium_mg decimal,
  ADD COLUMN IF NOT EXISTS nutriscore text;

-- Add comments for documentation
COMMENT ON COLUMN items.calories IS 'Calories per serving';
COMMENT ON COLUMN items.protein_g IS 'Protein in grams per serving';
COMMENT ON COLUMN items.carbs_g IS 'Carbohydrates in grams per serving';
COMMENT ON COLUMN items.fat_g IS 'Fat in grams per serving';
COMMENT ON COLUMN items.fiber_g IS 'Fiber in grams per serving';
COMMENT ON COLUMN items.sugar_g IS 'Sugar in grams per serving';
COMMENT ON COLUMN items.sodium_mg IS 'Sodium in milligrams per serving';
COMMENT ON COLUMN items.nutriscore IS 'Nutri-Score rating (A-E)';
