
-- 1. DROP CONSTRAINTS AND CHANGE COLUMN TYPES TO TEXT
DO $$
BEGIN
  -- Drop foreign keys linking to drills table (e.g. from user_drills)
  ALTER TABLE IF EXISTS public.user_drills DROP CONSTRAINT IF EXISTS user_drills_drill_id_fkey;
  
  -- Change columns to TEXT to accept non-UUIDs
  ALTER TABLE public.user_drills ALTER COLUMN drill_id TYPE TEXT USING drill_id::text;
  ALTER TABLE public.drills ALTER COLUMN id TYPE TEXT USING id::text;
  
  -- Recreate foreign key
  ALTER TABLE public.user_drills 
    ADD CONSTRAINT user_drills_drill_id_fkey 
    FOREIGN KEY (drill_id) REFERENCES public.drills(id) ON DELETE CASCADE;
EXCEPTION
  WHEN OTHERS THEN RAISE NOTICE 'Schema update error: %', SQLERRM;
END $$;

-- 2. ADD MISSING COLUMNS
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drills' AND column_name='focus') THEN 
    ALTER TABLE public.drills ADD COLUMN focus TEXT; 
  END IF; 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drills' AND column_name='goal') THEN 
    ALTER TABLE public.drills ADD COLUMN goal TEXT; 
  END IF; 
END $$;

-- 3. WIPE ALL DATA IN USER_DRILLS & DRILLS SO WE START 100% FRESH
DELETE FROM public.user_drills;
DELETE FROM public.drills;

-- 4. INSERT THE 121 NEW DRILLS WITH RAW IDS
INSERT INTO public.drills (id, title, category, focus, description, pdf_url, video_url, goal, created_at)
VALUES
('PUTT-GATE-001', 'Gate Drill Centre Strike  3 ft (L to R)', 'Putting', '<6ft Make %', 'Find the Line: Locate a small breaking Left to Right 3-foot putt on the green to ensure zero break.
Anchor the Putter: Place your putter head behind the ball as if you are ready to stroke it.
Set the Gate: Insert two tees into the ground—one just outside the toe and one just outside the heel of the putter.
Adjust Clearance: Start with about 0.5cm of space on either side of the putter head.
The Test: Ensure the putter can pass through the "gate" without clicking the tees; as you improve, narrow the gap to increase the difficulty.', NULL, NULL, '18 in a row', '2026-03-01T04:23:39.653Z'),
('PUTT-GATE-002', 'Gate Drill Centre Strike  3 ft Straight', 'Putting', '<6ft Make %', 'Find the Line: Locate a dead-flat 3-foot putt on the green to ensure zero break.
Anchor the Putter: Place your putter head behind the ball as if you are ready to stroke it.
Set the Gate: Insert two tees into the ground—one just outside the toe and one just outside the heel of the putter.
Adjust Clearance: Start with about 0.5cm of space on either side of the putter head.
The Test: Ensure the putter can pass through the "gate" without clicking the tees; as you improve, narrow the gap to increase the difficulty.', NULL, NULL, '18 in a row', '2026-03-01T04:23:39.653Z'),
('PUTT-GATE-003', 'Gate Drill Centre Strike  3 ft (R to L)', 'Putting', '<6ft Make %', 'Find the Line: Locate a small breaking Right to Left 3-foot putt on the green to ensure zero break.
Anchor the Putter: Place your putter head behind the ball as if you are ready to stroke it.
Set the Gate: Insert two tees into the ground—one just outside the toe and one just outside the heel of the putter.
Adjust Clearance: Start with about 0.5cm of space on either side of the putter head.
The Test: Ensure the putter can pass through the "gate" without clicking the tees; as you improve, narrow the gap to increase the difficulty.', NULL, NULL, '18 in a row', '2026-03-01T04:23:39.653Z'),
('PUTT-GATE-004', 'Gate Drill Start Line 3 ft (L to R)', 'Putting', '<6ft Make %', 'Find a 3ft small breaking Left to Right Putt. Set two tees 3 inches in front of the ball, just wider than the ball’s diameter. Goal: Roll the ball through the "start gate" without touching the tees. Focus on a square face at impact to ensure the ball starts on the intended line.', NULL, NULL, '18 in a row', '2026-03-01T04:23:39.654Z'),
('PUTT-GATE-005', 'Gate Drill Start Line 3 ft Straight', 'Putting', '<6ft Make %', 'Find a 3ft straight putt. Set two tees 3 inches in front of the ball, just wider than the ball’s diameter. Goal: Roll the ball through the "start gate" without touching the tees. Focus on a square face at impact to ensure the ball starts on the intended line.', NULL, NULL, '18 in a row', '2026-03-01T04:23:39.654Z'),
('PUTT-GATE-006', 'Gate Drill Start Line 3 ft (R to L)', 'Putting', '<6ft Make %', 'Find a 3ft  small breaking Right to Left Putt. Set two tees 3 inches in front of the ball, just wider than the ball’s diameter. Goal: Roll the ball through the "start gate" without touching the tees. Focus on a square face at impact to ensure the ball starts on the intended line.', NULL, NULL, '18 in a row', '2026-03-01T04:23:39.654Z'),
('CHIP-RHON-007', 'Right Hand Only', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-LHON-008', 'Left Hand Only', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-CROS-009', 'Cross Handed', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-TREX-010', 'T-rex Drill', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-TOWE-011', 'Towel Under the arms', 'Chipping', 'Scambling % (<6ft)', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-5MET-012', '5 metre Chip', 'Chipping', 'Scambling % (<6ft)', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-10ME-013', '10 metre Chip', 'Chipping', 'Scambling % (<6ft)', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-15ME-014', '15 metre Chip', 'Chipping', 'Scambling % (<6ft)', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-20ME-015', '20 metre Chip', 'Chipping', 'Scambling % (<6ft)', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-25ME-016', '25 metre Chip', 'Chipping', 'Scambling % (<6ft)', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-30ME-017', '30 metre Chip', 'Chipping', 'Scambling % (<6ft)', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-FLOP-018', 'Flop Shot', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-PUTT-019', 'Putting Chip', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-OBCH-020', 'Over Bunker Chip', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-BANR-021', 'Bump and Runs', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-UPDE-022', 'Up and down with every Club', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-P218-023', 'Par 2 18 holes scoring', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-P29H-024', 'Par 2 9 holes scoring', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-BAFC-025', 'Ball First contact', 'Chipping', 'Up & Down %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('CHIP-123B-026', 'One bounce, two bounce, three bounce', 'Chipping', 'Scambling % (<6ft)', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-ALTH-027', 'Alternate tee height', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-SIFW-028', 'Simualted Fariway', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-LBFL-029', 'Low Ball', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-ALTB-030', 'Aternate Ball Flight', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-80SW-031', '80 Percent Swings', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-SPED-032', 'Speed Training', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-HAPF-033', 'Hitting all parts of the face', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-MOCS-034', 'Missing on the correct side', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-GDDR-035', 'Grip down driver', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-9BFD-036', '9 Ball flight Driver', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-SWRE-037', 'Swing review', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-HBFL-038', 'High Ball Flight', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('DRIV-OPTE-039', 'Opening Tee shot', 'Driving', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-DIDE-040', 'Divot Depth', 'Irons', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-HMDI-041', 'Hiitng multiple distances', 'Irons', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-LOSH-042', 'Low Shot', 'Irons', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-GRDW-043', 'Grip down Iron', 'Irons', 'GIR 20ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-SWRE-044', 'Swing review', 'Irons', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-SECH-045', 'Set Up check', 'Irons', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-9BAL-046', '9 Ball flight irons', 'Irons', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-SASD-047', 'Safe Side', 'Irons', 'GIR 20ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-STDR-048', 'Step Drill', 'Irons', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-FING-049', 'Finger Dispersion 9 Shots', 'Irons', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-HB2F-050', 'Hit between 2 fingers consecutively', 'Irons', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-HB3F-051', 'Hit between 3 fingers consecutively', 'Irons', 'GIR 20ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-3SWG-052', '3 Swing lengths', 'Irons', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-RESP-053', 'Recovery Shot Practice', 'Irons', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-RBFD-054', 'Repeatable Ball flight drill', 'Irons', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('IRON-TETW-055', 'Tempo town', 'Irons', 'GIR 20ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-CLSY-056', 'Clock System', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-RUSW-057', 'Ramping Up Speed Full Wedge Swing', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-LOFL-058', 'Low Flight', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-MEDF-059', 'Medium Flight', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-HIGF-060', 'High Flight', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-CUTS-061', 'Cut spin', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-DRSP-062', 'Draw spin', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-CKDO-063', 'Choke Down', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-BAPO-064', 'Ball Position Effects', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-HN2F-065', 'Hit between 2 fingers consecutively', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-HB1F-066', 'Hit between 1 finger consecutively', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-LD1F-067', 'Ladder drill 1 finger 30-100m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-RHON-068', 'Right Hand only', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-LFON-069', 'Left Hand Only', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-TOWE-070', 'Towel Under the arms', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-DIDE-071', 'Divot Depth', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-LALA-072', 'Left Arm to Left Arm', 'Wedges', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-30ME-073', '30m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-40ME-074', '40m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-50ME-075', '50m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-60ME-076', '60m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-70ME-077', '70m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-80ME-078', '80m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-90ME-079', '90m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('WEDG-100M-080', '100m', 'Wedges', 'GIR 8ft', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-JOTFL-081', 'Just over the Lip', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-SADE-082', 'Sand Depth', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-LIDR-083', 'Line Drill', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-DHBS-084', 'Downhill Bunker Shot', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-UHBS-085', 'Uphill Bunker Shot', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-PBSH-086', 'Plugged Bunker Shot', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-ABFT-087', 'Above Feet', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-UPDW-088', 'Up and down 9 holes', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-LOSP-089', 'Low Spin', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-MEDP-090', 'Medium Spin', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-HSPN-091', 'High Spin', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-5MBK-092', '5m Bunker', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-10MB-093', '10m Bunker', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-15MB-094', '15m Bunker', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-20MB-095', '20m Bunker', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-25MB-096', '25m Bunker', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('BUNK-30BS-097', '30m Bunker', 'Bunkers', 'Bunker Saves', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('MENT-RIRO-098', 'Routine Irons/Driver', 'Mental/Strategy', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('MENT-RIRW-099', 'Routine Wedges/Chipping', 'Mental/Strategy', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('MENT-VISU-100', 'Visualisation', 'Mental/Strategy', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('MENT-NOTH-101', 'No thought hit drill', 'Mental/Strategy', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('MENT-OHPT-102', 'Opening hole play through', 'Mental/Strategy', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('MENT-ENVI-103', 'Environmental', 'Mental/Strategy', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('MENT-COMI-104', 'Course Map Irons', 'Mental/Strategy', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('MENT-COMD-105', 'Course Map Driver', 'Mental/Strategy', 'FIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('9HOL-REDT-106', 'Red Tees', '9-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('9HOL-YELT-107', 'Yellow Tees', '9-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('9HOL-COMP-108', 'Competition Tees', '9-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('9HOL-TIGR-109', 'Tiger Tees', '9-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('9HOL-ONCE-110', 'One club extra', '9-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('9HOL-TWCE-111', 'Two clubs extra', '9-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('9HOL-ODDC-112', 'Odd clubs', '9-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('9HOL-EVCL-113', 'Even Clubs', '9-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('18HO-REDT-114', 'Red Tees', '18-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('18HO-YELT-115', 'Yellow Tees', '18-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('18HO-COMT-116', 'Competition Tees', '18-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('18HO-TIGR-117', 'Tiger Tees', '18-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('18HO-OCEX-118', 'One club extra', '18-Hole Round', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('18HO-TWOC-119', 'Two clubs extra', '18-Hole Round', 'GIR %', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('18HO-ODCL-120', 'Odd clubs', '18-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z'),
('18HO-EVCL-121', 'Even Clubs', '18-Hole Round', 'Gross Score', '', NULL, NULL, '', '2026-03-01T04:23:39.654Z')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  focus = EXCLUDED.focus,
  description = EXCLUDED.description,
  pdf_url = EXCLUDED.pdf_url,
  video_url = EXCLUDED.video_url,
  goal = EXCLUDED.goal;
