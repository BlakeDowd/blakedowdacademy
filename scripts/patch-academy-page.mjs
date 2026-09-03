import fs from "fs";

const importLine = `import {
  fetchUserProfiles,
  formatLeaderboardValue,
  getLeaderboardData,
  getMockLeaderboard,
} from "@/lib/academyLeaderboard";
`;

const path = "src/app/academy/page.tsx";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
const before = lines.slice(0, 157);
const after = lines.slice(3392);
const next = [...before, ...after].join("\n");
const withImport = next.includes("@/lib/academyLeaderboard")
  ? next
  : next.replace(
      'import {\n  practiceSessionMinutesFromRow,',
      `${importLine}import {\n  practiceSessionMinutesFromRow,`,
    );
fs.writeFileSync(path, withImport);
console.log("Updated academy page imports and removed extracted helpers");
