-- Ensure chip_inside_6ft and inside_6ft columns exist for Chips Inside 6ft %
-- Run in Supabase SQL Editor if Chips Inside 6ft % is not showing in the Full Metric Matrix

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS chip_inside_6ft INTEGER DEFAULT 0;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS inside_6ft INTEGER DEFAULT 0;

-- Sync data: copy chip_inside_6ft -> inside_6ft where inside_6ft is empty
UPDATE rounds SET inside_6ft = chip_inside_6ft 
WHERE chip_inside_6ft IS NOT NULL AND chip_inside_6ft > 0 AND (inside_6ft IS NULL OR inside_6ft = 0);

-- Sync data: copy inside_6ft -> chip_inside_6ft where chip_inside_6ft is empty (legacy data)
UPDATE rounds SET chip_inside_6ft = inside_6ft 
WHERE inside_6ft IS NOT NULL AND inside_6ft > 0 AND (chip_inside_6ft IS NULL OR chip_inside_6ft = 0);
