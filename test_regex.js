const fs = require('fs');

const file = 'src/app/academy/page.tsx';
const content = fs.readFileSync(file, 'utf8');

const regex = /        \{\/\* Reusable Leaderboard Card Component \*\/\}[\s\S]*?      <\/div>\r?\n    <\/div>\r?\n  \);\r?\n}\r?\n/;

if (regex.test(content)) {
  console.log("Found block to replace");
} else {
  console.log("Could not find block to replace");
  // let's try a different regex
}

