import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const supabaseUrl = urlMatch ? urlMatch[1].trim() : '';
const supabaseKey = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(supabaseUrl, supabaseKey);

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
          currentString += '"'; i++;
        } else {
          inQuotes = false;
        }
      } else { currentString += char; }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentString); currentString = '';
      } else if (char === '\n') {
        currentLine.push(currentString); result.push(currentLine); currentLine = []; currentString = '';
      } else if (char !== '\r') { currentString += char; }
    }
  }
  if (currentString !== '' || currentLine.length > 0) {
    currentLine.push(currentString); result.push(currentLine);
  }
  return result;
}

function generateUUID(str) {
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return [
    hash.substring(0, 8), hash.substring(8, 12), '4' + hash.substring(13, 16),
    '8' + hash.substring(17, 20), hash.substring(20, 32)
  ].join('-');
}

const rows = parseCSV(csvData);
const drills = [];

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length < 2 || !row[0]) continue;
  
  const rawId = row[0].trim();
  drills.push({
    id: generateUUID(rawId),
    title: row[1] ? row[1].trim() : '',
    category: row[2] ? row[2].trim() : 'Practice',
    description: row[6] ? row[6].trim() : '',
    pdf_url: row[7] ? row[7].trim() : null,
    video_url: row[8] ? row[8].trim() : null,
    // Store Goal/Reps in drill_levels for now to avoid needing a schema change!
    drill_levels: row[9] ? JSON.stringify([{ id: 'goal-1', name: 'Goal: ' + row[9].trim(), completed: false }]) : null,
  });
}

async function run() {
  console.log('Fetching existing drills to wipe...');
  const { data: existing, error: err1 } = await supabase.from('drills').select('id');
  if (err1) {
    console.error('Error fetching:', err1);
  } else if (existing && existing.length > 0) {
    const ids = existing.map(d => d.id);
    const { error: err2 } = await supabase.from('drills').delete().in('id', ids);
    if (err2) {
      console.log('Failed to delete (RLS might be blocking):', err2.message);
    } else {
      console.log('Wiped existing drills.');
    }
  }
  
  console.log('Inserting new drills...');
  const { error: err3 } = await supabase.from('drills').upsert(drills);
  if (err3) {
    console.log('Failed to insert:', err3.message);
  } else {
    console.log(`Successfully uploaded ${drills.length} drills to Supabase without manual SQL!`);
  }
}

run();