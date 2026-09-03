import fs from "fs";

const lines = fs.readFileSync("src/app/academy/page.tsx", "utf8").split(/\r?\n/);
const header = `// Shared leaderboard helpers for Academy + Home Hall Of Fame
import {
  parsePuttingHoleSession,
  bestClusteredPuttingTestScoreAndSessionEndMs,
  isCompletePuttingCombineSession,
  parsePutting9HoleSession,
  isCompletePutting9Session,
  parsePuttingTest3To6ftSession,
  isCompletePuttingTest3To6ftSession,
  parsePuttingTest8To20Session,
  isCompletePuttingTest8To20Session,
  parsePuttingTest20To40Session,
  isCompletePuttingTest20To40Session,
} from "@/lib/puttingTestLeaderboard";
import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";
import { gauntletPrecisionProtocolConfig } from "@/lib/gauntletPrecisionProtocolConfig";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import {
  buildGauntletBlackLabelLeaderboard,
  computeBestGauntletSessionForUser,
} from "@/lib/gauntletLeaderboard";
import {
  buildAcademyCombinesLeaderboard,
  isLeaderboardDrivenCombineId,
} from "@/lib/academyCombinesLeaderboard";
import {
  practiceSessionMinutesFromRow,
  practiceSessionsForUser,
} from "@/lib/practiceSessionDuration";

`;

const body = lines.slice(158, 3392).join("\n");
const footer = `
export {
  getTimeframeDates,
  fetchUserProfiles,
  getMockLeaderboard,
  formatLeaderboardValue,
  getLeaderboardData,
};
`;

fs.writeFileSync("src/lib/academyLeaderboard.ts", header + body + footer);
console.log("Extracted academy leaderboard helpers");
