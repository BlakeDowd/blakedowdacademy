import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

import crypto from 'crypto';

// Get env vars
const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const supabaseUrl = urlMatch ? urlMatch[1].trim() : '';
const supabaseKey = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(supabaseUrl, supabaseKey);

const csvData = fs.readFileSync('C:\\Users\\Owner\\Downloads\\Drill List App - Sheet1.csv', 'utf-8');

// Proper CSV parser to handle quotes and commas inside quotes
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
          i++; // skip next quote
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
const headers = rows[0].map(h => h.trim());

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
  
  const rawId = row[0].trim();
  
  const drill = {
    id: generateUUID(rawId),
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

console.log(`Parsed ${drills.length} drills. Upserting to Supabase...`);

async function run() {
  // Check schema
  const { data, error: schemaError } = await supabase
    .from('drills')
    .select('*')
    .limit(1);
    
  let hasFocus = false;
  let hasGoal = false;
  
  if (data && data.length > 0) {
    const keys = Object.keys(data[0]);
    hasFocus = keys.includes('focus');
    hasGoal = keys.includes('goal') || keys.includes('goal_reps');
    console.log('Columns found:', keys);
  }

  let sql = 'INSERT INTO public.drills (id, title, category, description, pdf_url, video_url, created_at';
  if (hasFocus) sql += ', focus';
  if (hasGoal) sql += ', goal';
  sql += ')\nVALUES\n';
  
  const values = drills.map(d => {
    const escape = (str) => {
      if (str === null || str === undefined) return 'NULL';
      return "'" + str.replace(/'/g, "''") + "'";
    };
    let valStr = `('${d.id}', ${escape(d.title)}, ${escape(d.category)}, ${escape(d.description)}, ${escape(d.pdf_url)}, ${escape(d.video_url)}, '${d.created_at}'`;
    if (hasFocus) valStr += `, ${escape(d.focus)}`;
    if (hasGoal) valStr += `, ${escape(d.goal)}`;
    valStr += ')';
    return valStr;
  });
  
  sql += values.join(',\n');
  sql += '\nON CONFLICT (id) DO UPDATE SET\n';
  sql += '  title = EXCLUDED.title,\n';
  sql += '  category = EXCLUDED.category,\n';
  sql += '  description = EXCLUDED.description,\n';
  sql += '  pdf_url = EXCLUDED.pdf_url,\n';
  sql += '  video_url = EXCLUDED.video_url';
  
  if (hasFocus) sql += ',\n  focus = EXCLUDED.focus';
  if (hasGoal) sql += ',\n  goal = EXCLUDED.goal';
  
  sql += ';\n';
  
  fs.writeFileSync('seed_drills.sql', sql);
  console.log('Successfully generated seed_drills.sql. Please run this file in your Supabase SQL Editor to bypass RLS.');
}

run();