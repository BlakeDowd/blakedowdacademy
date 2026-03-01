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
    drill_id: rawId,
    title: row[1] ? row[1].trim() : '',
    category: row[2] ? row[2].trim() : 'Practice',
    focus: row[4] ? row[4].trim() : '',
    description: row[6] ? row[6].trim() : '',
    pdf_url: row[7] ? row[7].trim() : undefined,
    youtube_url: row[8] ? row[8].trim() : undefined,
    video_url: row[8] ? row[8].trim() : undefined,
    goal: row[9] ? row[9].trim() : '',
    estimatedMinutes: 15,
    xpValue: 10,
    contentType: row[8] ? 'video' : (row[7] ? 'pdf' : 'text')
  });
}

const tsContent = `export interface DrillRecord {
  id: string;
  drill_id: string;
  title: string;
  category: string;
  focus: string;
  description: string;
  pdf_url?: string;
  youtube_url?: string;
  video_url?: string;
  goal: string;
  estimatedMinutes: number;
  xpValue: number;
  contentType: 'video' | 'pdf' | 'text';
}

export const OFFICIAL_DRILLS: DrillRecord[] = ${JSON.stringify(drills, null, 2)};
`;

fs.writeFileSync('src/data/official_drills.ts', tsContent);
console.log('Successfully generated src/data/official_drills.ts');