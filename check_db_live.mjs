import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const supabaseUrl = urlMatch ? urlMatch[1].trim() : '';
const supabaseKey = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching from drills...');
  const { data, error } = await supabase.from('drills').select('*').limit(5);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Data:', data);
    if (data.length > 0) {
      console.log('Columns:', Object.keys(data[0]));
    } else {
      console.log('No data found.');
      // Let's try to insert a test record to see if we can see columns in error message
      const { error: insErr } = await supabase.from('drills').insert({id: 'test', title: 'test'});
      if (insErr) console.log('Insert error details:', insErr);
    }
  }
}

run();