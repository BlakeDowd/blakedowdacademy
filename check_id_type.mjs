import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const supabaseUrl = urlMatch ? urlMatch[1].trim() : '';
const supabaseKey = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_column_info', { table_name: 'drills', column_name: 'id' });
  if (error) {
    console.error('RPC Error:', error.message);
    // fallback
    const { data: d2 } = await supabase.from('drills').select('id').limit(1);
    if (d2 && d2.length > 0) {
      console.log('Sample ID:', d2[0].id);
    }
  } else {
    console.log(data);
  }
}

run();