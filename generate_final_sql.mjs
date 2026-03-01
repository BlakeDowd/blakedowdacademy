import fs from 'fs';
import crypto from 'crypto';

const csvData = fs.readFileSync('C:\\Users\\Owner\\Downloads\\Drill List App - Sheet1.csv', 'utf-8');

function parseCSV(text) {
  const result = [];
  let currentLine = [];
  let currentString = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentString += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentString += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentString);
        currentString = '';
      } else if (char === '\n') {
        currentLine.push(currentString);
        result.push(currentLine);
        currentLine = [];
        currentString = '';
      } else if (char !== '\r') {
        currentString += char;
      }
    }
  }
  
  if (currentString !== '' || currentLine.length > 0) {
    currentLine.push(currentString);
    result.push(currentLine);
  }
  
  return result;
}

const rows = parseCSV(csvData);

function generateUUID(str) {
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    '8' + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

const drills = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length < 2 || !row[0]) continue;
  
  const rawId = row[0].trim(); // the PUTT-, IRON- string
  
  const drill = {
    id: rawId, // Use raw string directly as ID
    title: row[1] ? row[1].trim() : '',
    category: row[2] ? row[2].trim() : 'Practice',
    focus: row[4] ? row[4].trim() : '',
    description: row[6] ? row[6].trim() : '',
    pdf_url: row[7] ? row[7].trim() : null,
    video_url: row[8] ? row[8].trim() : null,
    goal: row[9] ? row[9].trim() : '',
    created_at: new Date().toISOString()
  };
  drills.push(drill);
}

let sql = `
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
`;

const values = drills.map(d => {
  const escape = (str) => {
    if (str === null || str === undefined) return 'NULL';
    return "'" + str.replace(/'/g, "''") + "'";
  };
  return `('${d.id}', ${escape(d.title)}, ${escape(d.category)}, ${escape(d.focus)}, ${escape(d.description)}, ${escape(d.pdf_url)}, ${escape(d.video_url)}, ${escape(d.goal)}, '${d.created_at}')`;
});

sql += values.join(',\n');
sql += `
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  focus = EXCLUDED.focus,
  description = EXCLUDED.description,
  pdf_url = EXCLUDED.pdf_url,
  video_url = EXCLUDED.video_url,
  goal = EXCLUDED.goal;
`;

fs.writeFileSync('FINAL_DB_WIPE_AND_UPDATE.sql', sql);
console.log('Successfully generated FINAL_DB_WIPE_AND_UPDATE.sql.');
