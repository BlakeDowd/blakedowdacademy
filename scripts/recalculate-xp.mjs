#!/usr/bin/env node
/**
 * Recalculate XP for a user from practice + rounds.
 * Usage: node scripts/recalculate-xp.mjs [username]
 * Example: node scripts/recalculate-xp.mjs gilletjack7
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY if available (required to update other users).
 * Falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY (may fail due to RLS).
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local');
  process.exit(1);
}
const env = fs.readFileSync(envPath, 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const supabaseUrl = urlMatch ? urlMatch[1].trim() : '';
const supabaseKey = keyMatch ? keyMatch[1].trim() : '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const XP_PER_ROUND = 500;
/** Keep in sync with src/lib/combineXp.ts — awarded once per finished combine at runtime. */
const XP_PER_COMBINE_SESSION = 330;

/** practice.test_type / practice.type for single-row leaderboard combines */
const COMBINE_TEST_TYPES = new Set([
  'aimpoint_6ft_combine',
  'slope_mid_20ft',
  'aimpoint_long_40ft',
  'chipping_combine_9',
  'wedge_lateral_9',
  'tee_shot_dispersion_combine',
  'bunker_9_hole_challenge',
]);

/** practice_logs.log_type — distinct combine protocols (not generic "chipping"; see isChippingCombineLog) */
const COMBINE_PRACTICE_LOG_TYPES = [
  'gauntlet_protocol_session',
  'iron_precision_protocol_session',
  'start_line_speed_test',
  'strike_speed_control',
  'flop_shot',
  'survival_20',
  'iron_face_control',
  'iron_skills',
];

function isChippingCombineLogRow(row) {
  return (
    String(row?.log_type || '') === 'chipping' &&
    ['standard', 'low_chip'].includes(String(row?.sub_type || ''))
  );
}

/**
 * XP for one practice row when it represents a finished combine (matches runtime awardCombineCompletionXp).
 */
function combineXpForPracticeRow(p) {
  const tt = String(p.test_type || '');
  if (COMBINE_TEST_TYPES.has(tt)) return XP_PER_COMBINE_SESSION;
  const typ = String(p.type || '');
  if (COMBINE_TEST_TYPES.has(typ)) return XP_PER_COMBINE_SESSION;

  const notes = p.notes;
  if (typeof notes !== 'string' || !notes.startsWith('{')) return 0;
  try {
    const parsed = JSON.parse(notes);
    const hi = parsed?.holeIndex;
    if (typeof hi !== 'number') return 0;
    const kind = parsed?.kind;
    if (kind === 'PuttingTest9Holes' && hi === 8) return XP_PER_COMBINE_SESSION;
    if (kind === 'PuttingTest3To6ft' && hi === 9) return XP_PER_COMBINE_SESSION;
    if (kind === 'PuttingTest8to20' && hi === 9) return XP_PER_COMBINE_SESSION;
    if (kind === 'PuttingTest20to40' && hi === 9) return XP_PER_COMBINE_SESSION;
    if (kind === 'putting_test_hole' && hi === 17) return XP_PER_COMBINE_SESSION;
  } catch {
    return 0;
  }
  return 0;
}

const FACILITIES = ['Driving', 'Irons', 'Wedges', 'Chipping', 'Bunkers', 'Putting', 'Mental/Strategy', 'On-Course', 'range-mat', 'putting-green', 'chipping-green', 'home', 'mental'];

async function recalculateXP(username) {
  // 1. Find user (profiles.full_name contains username)
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, full_name, total_xp')
    .ilike('full_name', `%${username}%`);

  if (profileErr) {
    console.error('Error fetching profile:', profileErr);
    process.exit(1);
  }
  if (!profiles || profiles.length === 0) {
    console.error(`No profile found for "${username}"`);
    process.exit(1);
  }

  const profile = profiles[0];
  const userId = profile.id;
  console.log(`Found: ${profile.full_name} (${userId})`);
  console.log(`Current total_xp: ${profile.total_xp}`);

  // 2. Fetch practice rows
  const { data: practiceRows, error: practiceErr } = await supabase
    .from('practice')
    .select('id, type, test_type, duration_minutes, notes')
    .eq('user_id', userId);

  if (practiceErr) {
    console.error('Error fetching practice:', practiceErr);
    process.exit(1);
  }

  // 3. Fetch drills for xp_value lookup (practice.type = drill_id)
  const { data: drills } = await supabase.from('drills').select('id, xp_value, xp');

  const drillXpMap = new Map();
  (drills || []).forEach(d => {
    const xp = d.xp_value ?? d.xp ?? 30;
    drillXpMap.set(String(d.id), Number(xp));
  });

  // 4. Calculate XP from practice
  let practiceXP = 0;
  (practiceRows || []).forEach(p => {
    const combineXp = combineXpForPracticeRow(p);
    if (combineXp > 0) {
      practiceXP += combineXp;
      return;
    }

    const duration = Number(p.duration_minutes) || 0;
    const type = String(p.type || '');

    if (FACILITIES.some(f => type.toLowerCase().includes(f.toLowerCase())) || /^(range-mat|putting-green|chipping|bunker|mental|home|driving|irons|wedges)$/i.test(type)) {
      practiceXP += Math.floor(duration / 10) * 10;
    } else {
      practiceXP += drillXpMap.get(type) ?? 30;
    }
  });

  const { data: practiceLogRows } = await supabase
    .from('practice_logs')
    .select('log_type, sub_type')
    .eq('user_id', userId);

  let combineLogSessions = 0;
  (practiceLogRows || []).forEach((row) => {
    const lt = String(row.log_type || '');
    if (COMBINE_PRACTICE_LOG_TYPES.includes(lt)) combineLogSessions++;
    else if (isChippingCombineLogRow(row)) combineLogSessions++;
  });
  const combineLogsXp = combineLogSessions * XP_PER_COMBINE_SESSION;
  practiceXP += combineLogsXp;

  // 5. Fetch rounds
  const { count: roundsCount, error: roundsErr } = await supabase
    .from('rounds')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (roundsErr) {
    console.error('Error fetching rounds:', roundsErr);
  }
  const roundsXP = (roundsCount || 0) * XP_PER_ROUND;

  const newTotalXP = practiceXP + roundsXP;
  console.log(
    `Practice XP: ${practiceXP} (${practiceRows?.length || 0} practice rows + ${combineLogSessions} combine practice_logs × ${XP_PER_COMBINE_SESSION})`,
  );
  console.log(`Rounds XP: ${roundsXP} (${roundsCount || 0} rounds × ${XP_PER_ROUND})`);
  console.log(`Recalculated total: ${newTotalXP}`);

  // 6. Update profile
  let newLevel = 1;
  if (newTotalXP >= 3000) newLevel = 4 + Math.floor((newTotalXP - 3000) / 2000);
  else if (newTotalXP >= 1500) newLevel = 3;
  else if (newTotalXP >= 500) newLevel = 2;

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ total_xp: newTotalXP, current_level: newLevel })
    .eq('id', userId);

  if (updateErr) {
    console.error('Error updating profile (RLS may block - try SUPABASE_SERVICE_ROLE_KEY):', updateErr);
    process.exit(1);
  }

  console.log(`Updated profiles.total_xp: ${profile.total_xp} → ${newTotalXP} (level ${newLevel})`);
}

const args = process.argv.slice(2);
const listProfiles = args.includes('--list');
const username = args.find(a => !a.startsWith('--')) || 'gillettjack7';

async function main() {
  if (listProfiles) {
    const { data, error } = await supabase.from('profiles').select('id, full_name, total_xp').order('full_name');
    if (error) { console.error(error); process.exit(1); }
    console.log('Profiles:');
    (data || []).forEach(p => console.log(`  ${p.full_name} (${p.id}) - ${p.total_xp} XP`));
  } else {
    await recalculateXP(username);
  }
}
main();
