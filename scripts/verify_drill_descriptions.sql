-- Verify drill descriptions in Supabase
-- Run this in Supabase SQL Editor to check if the description column has data.

-- 1. Count drills with non-empty descriptions
SELECT 
  COUNT(*) FILTER (WHERE description IS NOT NULL AND TRIM(description) != '') AS with_description,
  COUNT(*) FILTER (WHERE description IS NULL OR TRIM(description) = '') AS without_description,
  COUNT(*) AS total
FROM public.drills;

-- 2. Sample a few drills to see their descriptions (first 5 with ids, titles, and description length)
SELECT id, title, 
  LENGTH(description) AS desc_length,
  LEFT(description, 80) AS desc_preview
FROM public.drills
ORDER BY id
LIMIT 10;

-- 3. If descriptions are empty, you can re-upload the CSV via Admin Dashboard
--    (Admin > Upsert Drill Library via CSV) to populate them.
