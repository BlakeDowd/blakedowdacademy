-- WIPE WEEKLY SCHEDULE (user_drills table)
DELETE FROM public.user_drills;

-- CLEANUP OLD FAKE DRILLS
-- Keep only drills where drill_id starts with official prefixes
DELETE FROM public.drills
WHERE drill_id NOT LIKE 'IRON-%' 
  AND drill_id NOT LIKE 'PUTT-%' 
  AND drill_id NOT LIKE 'CHIP-%' 
  AND drill_id NOT LIKE 'WEDG-%' 
  AND drill_id NOT LIKE 'DRIV-%' 
  AND drill_id NOT LIKE 'BUNK-%'
  OR drill_id IS NULL;
