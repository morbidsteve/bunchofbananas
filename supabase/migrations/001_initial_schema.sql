-- BunchOfBananas Initial Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Households table
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Household members (links users to households)
CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES auth.users(id),
  UNIQUE(household_id, user_id)
);

-- Storage units (fridges, freezers, pantries, etc.)
CREATE TABLE storage_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fridge', 'freezer', 'pantry', 'cabinet', 'other')),
  location TEXT,
  width_inches DECIMAL,
  height_inches DECIMAL,
  depth_inches DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shelves within storage units
CREATE TABLE shelves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storage_unit_id UUID NOT NULL REFERENCES storage_units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  height_inches DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items (master product catalog per household)
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  default_unit TEXT,
  barcode TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory (actual items on shelves)
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  shelf_id UUID NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  quantity DECIMAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL,
  expiration_date DATE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID NOT NULL REFERENCES auth.users(id),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores where items are purchased
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Price history for items
CREATE TABLE price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price DECIMAL NOT NULL,
  quantity DECIMAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  on_sale BOOLEAN DEFAULT FALSE
);

-- Inventory log for analytics
CREATE TABLE inventory_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('added', 'removed', 'used', 'expired', 'moved')),
  quantity_change DECIMAL NOT NULL,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Create indexes for common queries
CREATE INDEX idx_household_members_user ON household_members(user_id);
CREATE INDEX idx_household_members_household ON household_members(household_id);
CREATE INDEX idx_storage_units_household ON storage_units(household_id);
CREATE INDEX idx_shelves_storage_unit ON shelves(storage_unit_id);
CREATE INDEX idx_items_household ON items(household_id);
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_inventory_item ON inventory(item_id);
CREATE INDEX idx_inventory_shelf ON inventory(shelf_id);
CREATE INDEX idx_inventory_expiration ON inventory(expiration_date);
CREATE INDEX idx_price_history_item ON price_history(item_id);
CREATE INDEX idx_price_history_store ON price_history(store_id);
CREATE INDEX idx_inventory_log_item ON inventory_log(item_id);
CREATE INDEX idx_inventory_log_performed_at ON inventory_log(performed_at);

-- Enable Row Level Security
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Households: Users can only see households they belong to
CREATE POLICY "Users can view their households" ON households
  FOR SELECT USING (
    id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create households" ON households
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Owners can update their households" ON households
  FOR UPDATE USING (
    id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Owners can delete their households" ON households
  FOR DELETE USING (
    id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner')
  );

-- Household Members: Users can see members of their households
CREATE POLICY "Users can view household members" ON household_members
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can join households" ON household_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners can manage members" ON household_members
  FOR DELETE USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner')
  );

-- Storage Units: Users can manage storage in their households
CREATE POLICY "Users can view storage units" ON storage_units
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create storage units" ON storage_units
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update storage units" ON storage_units
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete storage units" ON storage_units
  FOR DELETE USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

-- Shelves: Users can manage shelves in their storage units
CREATE POLICY "Users can view shelves" ON shelves
  FOR SELECT USING (
    storage_unit_id IN (
      SELECT id FROM storage_units WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create shelves" ON shelves
  FOR INSERT WITH CHECK (
    storage_unit_id IN (
      SELECT id FROM storage_units WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update shelves" ON shelves
  FOR UPDATE USING (
    storage_unit_id IN (
      SELECT id FROM storage_units WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete shelves" ON shelves
  FOR DELETE USING (
    storage_unit_id IN (
      SELECT id FROM storage_units WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

-- Items: Users can manage items in their households
CREATE POLICY "Users can view items" ON items
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create items" ON items
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update items" ON items
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete items" ON items
  FOR DELETE USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

-- Inventory: Users can manage inventory in their households
CREATE POLICY "Users can view inventory" ON inventory
  FOR SELECT USING (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create inventory" ON inventory
  FOR INSERT WITH CHECK (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update inventory" ON inventory
  FOR UPDATE USING (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete inventory" ON inventory
  FOR DELETE USING (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

-- Stores: Users can manage stores in their households
CREATE POLICY "Users can view stores" ON stores
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create stores" ON stores
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update stores" ON stores
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete stores" ON stores
  FOR DELETE USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

-- Price History: Users can manage price history in their households
CREATE POLICY "Users can view price history" ON price_history
  FOR SELECT USING (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create price history" ON price_history
  FOR INSERT WITH CHECK (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

-- Inventory Log: Users can view and create logs for their households
CREATE POLICY "Users can view inventory log" ON inventory_log
  FOR SELECT USING (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create inventory log" ON inventory_log
  FOR INSERT WITH CHECK (
    item_id IN (
      SELECT id FROM items WHERE household_id IN (
        SELECT household_id FROM household_members WHERE user_id = auth.uid()
      )
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_storage_units_updated_at
  BEFORE UPDATE ON storage_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
