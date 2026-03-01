import fs from 'fs';
import crypto from 'crypto';

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

const validPrefixes = ['PUTT-', 'CHIP-', 'BUNK-', 'FULL-', 'DRIV-', 'IRON-', 'WEDG-'];
let sql = '-- Delete drills that do not start with official prefixes\n';
sql += 'DELETE FROM public.drills\n';
sql += 'WHERE ';
const conditions = validPrefixes.map(prefix => `id NOT LIKE '${prefix}%'`);
sql += conditions.join(' AND ') + ';\n';

// Because we mapped the CSV Drill IDs to UUIDs using generateUUID earlier... 
// actually the current drills in the database might be using UUIDs.
// Let me just delete everything that's NOT in the set of 121 UUIDs we generated.

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

const validIds = [];

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length < 2 || !row[0]) continue;
  
  const rawId = row[0].trim();
  validIds.push(generateUUID(rawId));
}

console.log(`Found ${validIds.length} valid drills from CSV.`);

const uuidList = validIds.map(id => `'${id}'`).join(',\n  ');

sql = `
-- This script deletes all drills that are NOT part of the new 122 drills from the CSV.
-- It ensures only your official new drills remain.

DELETE FROM public.drills
WHERE id NOT IN (
  ${uuidList}
);
`;

fs.writeFileSync('delete_old_drills.sql', sql);
console.log('Successfully generated delete_old_drills.sql. Please run this file in your Supabase SQL Editor.');
