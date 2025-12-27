-- User Recipes feature: personal recipe collection with text/OCR import and public sharing

-- Create user_recipes table
CREATE TABLE user_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),

  -- Recipe content
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT NOT NULL,
  category TEXT,
  cuisine TEXT,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  servings INTEGER,

  -- Image storage (Supabase Storage path)
  image_path TEXT,

  -- Source tracking (for imported recipes)
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'text_import', 'ocr_import', 'url_import')),
  source_url TEXT,
  original_text TEXT,

  -- Public sharing (similar to household sharing pattern)
  is_public BOOLEAN DEFAULT FALSE,
  share_token UUID DEFAULT uuid_generate_v4(),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe ingredients (normalized for matching with inventory)
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES user_recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,

  -- Normalized name for inventory matching
  normalized_name TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_user_recipes_household ON user_recipes(household_id);
CREATE INDEX idx_user_recipes_created_by ON user_recipes(created_by);
CREATE INDEX idx_user_recipes_share_token ON user_recipes(share_token);
CREATE INDEX idx_user_recipes_is_public ON user_recipes(is_public);
CREATE INDEX idx_user_recipes_category ON user_recipes(category);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_normalized ON recipe_ingredients(normalized_name);

-- Enable RLS
ALTER TABLE user_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_recipes

-- Users can view recipes from their household
CREATE POLICY "Users can view household recipes" ON user_recipes
  FOR SELECT USING (
    household_id IN (SELECT get_user_household_ids(auth.uid()))
  );

-- Anyone can view public recipes
CREATE POLICY "Anyone can view public recipes" ON user_recipes
  FOR SELECT USING (is_public = true);

-- Users can create recipes in their household
CREATE POLICY "Users can create recipes" ON user_recipes
  FOR INSERT WITH CHECK (
    household_id IN (SELECT get_user_household_ids(auth.uid()))
    AND created_by = auth.uid()
  );

-- Recipe creator can update their recipes
CREATE POLICY "Recipe creators can update" ON user_recipes
  FOR UPDATE USING (
    created_by = auth.uid()
    AND household_id IN (SELECT get_user_household_ids(auth.uid()))
  );

-- Recipe creator can delete their recipes
CREATE POLICY "Recipe creators can delete" ON user_recipes
  FOR DELETE USING (
    created_by = auth.uid()
    AND household_id IN (SELECT get_user_household_ids(auth.uid()))
  );

-- RLS Policies for recipe_ingredients

-- Users can view ingredients for visible recipes
CREATE POLICY "Users can view recipe ingredients" ON recipe_ingredients
  FOR SELECT USING (
    recipe_id IN (
      SELECT id FROM user_recipes WHERE
        household_id IN (SELECT get_user_household_ids(auth.uid()))
        OR is_public = true
    )
  );

-- Users can create ingredients for their recipes
CREATE POLICY "Users can create recipe ingredients" ON recipe_ingredients
  FOR INSERT WITH CHECK (
    recipe_id IN (
      SELECT id FROM user_recipes
      WHERE created_by = auth.uid()
        AND household_id IN (SELECT get_user_household_ids(auth.uid()))
    )
  );

-- Users can update ingredients for their recipes
CREATE POLICY "Users can update recipe ingredients" ON recipe_ingredients
  FOR UPDATE USING (
    recipe_id IN (
      SELECT id FROM user_recipes
      WHERE created_by = auth.uid()
        AND household_id IN (SELECT get_user_household_ids(auth.uid()))
    )
  );

-- Users can delete ingredients for their recipes
CREATE POLICY "Users can delete recipe ingredients" ON recipe_ingredients
  FOR DELETE USING (
    recipe_id IN (
      SELECT id FROM user_recipes
      WHERE created_by = auth.uid()
        AND household_id IN (SELECT get_user_household_ids(auth.uid()))
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_user_recipes_updated_at
  BEFORE UPDATE ON user_recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
