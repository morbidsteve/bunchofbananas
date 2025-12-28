-- Activity log for household members
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    action_description TEXT NOT NULL,
    entity_type TEXT, -- 'inventory', 'item', 'shelf', 'storage_unit', 'recipe', etc.
    entity_id UUID,
    entity_name TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by household
CREATE INDEX idx_activity_log_household ON activity_log(household_id, created_at DESC);

-- Enable RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view activity for their households
CREATE POLICY "Users can view activity for their households"
    ON activity_log FOR SELECT
    USING (
        household_id IN (
            SELECT household_id FROM household_members WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can insert activity for their households
CREATE POLICY "Users can insert activity for their households"
    ON activity_log FOR INSERT
    WITH CHECK (
        household_id IN (
            SELECT household_id FROM household_members WHERE user_id = auth.uid()
        )
        AND user_id = auth.uid()
    );

-- Create function to log activity (can be called from triggers or application code)
CREATE OR REPLACE FUNCTION log_activity(
    p_household_id UUID,
    p_action_type TEXT,
    p_action_description TEXT,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO activity_log (
        household_id,
        user_id,
        action_type,
        action_description,
        entity_type,
        entity_id,
        entity_name,
        metadata
    ) VALUES (
        p_household_id,
        auth.uid(),
        p_action_type,
        p_action_description,
        p_entity_type,
        p_entity_id,
        p_entity_name,
        p_metadata
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;
