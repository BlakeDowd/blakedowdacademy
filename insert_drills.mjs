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

async function run() {
  const { error } = await supabase.from('drills').upsert(drills);
  if (error) {
    console.error('Insert failed:', error.message);
  } else {
    console.log('Successfully inserted 121 drills!');
  }
}

run();