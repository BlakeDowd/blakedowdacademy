import type { ReactNode } from "react";

const ROUGH = "#14592c";
const FAIRWAY = "#2f8f4e";
const GREEN = "#4fb26f";
const SAND = "#e8d29a";
const WATER = "#3b82c4";
const TREE = "#0c3a1b";
const FLAG = "#FFA500";
const SKY = "#7cb8de";

function Flag({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={2.2} fill="#111" />
      <line x1={x} y1={y} x2={x} y2={y - 16} stroke="white" strokeWidth={1.4} />
      <path d={`M${x} ${y - 16} L${x + 9} ${y - 13} L${x} ${y - 10} Z`} fill={FLAG} />
    </g>
  );
}

function Ball({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={3.2} fill="white" stroke="#1f2937" strokeWidth={0.6} />;
}

function Label({ x, y, children, anchor = "middle" }: { x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={8} fontWeight={700} fill="white" style={{ fontFamily: "inherit" }}>
      {children}
    </text>
  );
}

function Tree({ x, y, r = 10 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={TREE} />
      <circle cx={x - r * 0.25} cy={y - r * 0.25} r={r * 0.55} fill="#14532d" />
    </g>
  );
}

function Tee({ x, y }: { x: number; y: number }) {
  return <rect x={x - 11} y={y - 4} width={22} height={8} rx={2} fill="#3aa45d" stroke="white" strokeOpacity={0.4} />;
}

/** Point on the clock face; rounded so server and browser render identical numbers. */
function clockPoint(deg: number, radius: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: Math.round((55 + Math.sin(a) * radius) * 100) / 100, y: Math.round((55 - Math.cos(a) * radius) * 100) / 100 };
}

function ClockHand({ deg, length, width }: { deg: number; length: number; width: number }) {
  const p = clockPoint(deg, length);
  return <line x1={55} y1={55} x2={p.x} y2={p.y} stroke="#111827" strokeWidth={width} strokeLinecap="round" />;
}

const flight = { fill: "none", stroke: "white", strokeOpacity: 0.85, strokeWidth: 1.8, strokeDasharray: "1 4", strokeLinecap: "round" as const };

const FAIRWAY_PATH = "M78 110 L86 0 L124 0 L132 110 Z";

const PICTURES: Record<string, { label: string; draw: ReactNode }> = {
  "l1-red": {
    label: "A ball sitting in water inside red stakes",
    draw: (
      <>
        <path d={FAIRWAY_PATH} fill={FAIRWAY} />
        <ellipse cx={105} cy={14} rx={20} ry={9} fill={GREEN} />
        <Flag x={108} y={16} />
        <ellipse cx={105} cy={60} rx={60} ry={19} fill={WATER} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" />
        {[
          [45, 60],
          [165, 60],
          [80, 43],
          [130, 43],
          [80, 77],
          [130, 77],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x! - 1.5} y={y! - 5} width={3} height={8} rx={1} fill="#ef4444" />
        ))}
        <ellipse cx={118} cy={62} rx={7} ry={3} fill="none" stroke="white" strokeOpacity={0.6} />
        <Ball x={118} y={61} />
        <Label x={172} y={88} anchor="end">Red stakes</Label>
      </>
    ),
  },
  "l1-ob": {
    label: "A tee shot sliced past the white out of bounds stakes",
    draw: (
      <>
        <path d={FAIRWAY_PATH} fill={FAIRWAY} />
        <Tee x={105} y={100} />
        <line x1={160} y1={4} x2={160} y2={106} stroke="white" strokeOpacity={0.5} strokeDasharray="3 4" />
        {[10, 28, 46, 64, 82, 100].map((y) => (
          <rect key={y} x={158.5} y={y - 5} width={3} height={8} rx={1} fill="white" />
        ))}
        <path d="M105 98 C 110 60, 150 30, 182 34" {...flight} />
        <Ball x={182} y={34} />
        <Label x={180} y={70}>OB</Label>
      </>
    ),
  },
  "l1-provisional": {
    label: "A drive heading into a clump of trees",
    draw: (
      <>
        <path d={FAIRWAY_PATH} fill={FAIRWAY} />
        <Tee x={105} y={100} />
        <Tree x={44} y={40} r={13} />
        <Tree x={64} y={28} r={11} />
        <Tree x={58} y={54} r={12} />
        <Tree x={30} y={60} r={10} />
        <path d="M105 98 C 100 70, 80 50, 58 40" {...flight} />
        <text x={70} y={22} fontSize={18} fontWeight={800} fill={FLAG}>
          ?
        </text>
      </>
    ),
  },
  "l1-bunker": {
    label: "A ball in a greenside bunker",
    draw: (
      <>
        <ellipse cx={140} cy={30} rx={50} ry={24} fill={GREEN} />
        <Flag x={150} y={30} />
        <path d="M30 70 C 30 50, 70 44, 100 52 C 130 60, 140 80, 118 92 C 90 104, 40 100, 30 70 Z" fill={SAND} />
        {[
          [52, 82],
          [60, 88],
          [70, 84],
        ].map(([x, y]) => (
          <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={2.5} ry={1.5} fill="#cdb57c" />
        ))}
        <Ball x={86} y={72} />
        <path d="M150 88 L 168 70" stroke="#d1d5db" strokeWidth={2} strokeLinecap="round" />
        <path d="M144 92 L 156 84" stroke="#9ca3af" strokeWidth={4} strokeLinecap="round" />
        <Label x={160} y={102}>Rake</Label>
      </>
    ),
  },
  "l1-scorecard": {
    label: "A scorecard where hole 4 shows 4 but the player made 5",
    draw: (
      <>
        <rect x={14} y={14} width={172} height={82} rx={8} fill="white" />
        <text x={24} y={34} fontSize={8} fontWeight={700} fill="#6b7280">
          HOLE
        </text>
        <text x={24} y={58} fontSize={8} fontWeight={700} fill="#6b7280">
          YOU MADE
        </text>
        <text x={24} y={82} fontSize={8} fontWeight={700} fill="#6b7280">
          CARD SAYS
        </text>
        {[
          [1, 4, 4],
          [2, 5, 5],
          [3, 3, 3],
          [4, 5, 4],
          [5, 4, 4],
        ].map(([hole, made, card], i) => {
          const x = 92 + i * 20;
          const wrong = made !== card;
          return (
            <g key={hole}>
              <text x={x} y={34} fontSize={9} fontWeight={700} fill="#111827" textAnchor="middle">
                {hole}
              </text>
              <text x={x} y={58} fontSize={11} fontWeight={800} fill="#014421" textAnchor="middle">
                {made}
              </text>
              <text x={x} y={82} fontSize={11} fontWeight={800} fill={wrong ? "#dc2626" : "#111827"} textAnchor="middle">
                {card}
              </text>
              {wrong && <circle cx={x} cy={78} r={8} fill="none" stroke="#dc2626" strokeWidth={1.5} />}
            </g>
          );
        })}
        <line x1={20} y1={42} x2={180} y2={42} stroke="#e5e7eb" />
        <line x1={20} y1={66} x2={180} y2={66} stroke="#e5e7eb" />
      </>
    ),
  },
  "l1-late": {
    label: "Tee time 8:00, arriving at 8:03",
    draw: (
      <>
        <circle cx={55} cy={55} r={38} fill="white" />
        {Array.from({ length: 12 }, (_, i) => {
          const inner = clockPoint(i * 30, 31);
          const outer = clockPoint(i * 30, 35);
          return (
            <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#374151" strokeWidth={i % 3 === 0 ? 2 : 1} />
          );
        })}
        <ClockHand deg={241.5} length={18} width={3} />
        <ClockHand deg={18} length={28} width={2} />
        <circle cx={55} cy={55} r={2.5} fill={FLAG} />
        <Label x={108} y={44} anchor="start">Tee time 8:00</Label>
        <text x={108} y={64} fontSize={8} fontWeight={700} fill={FLAG} style={{ fontFamily: "inherit" }}>
          You arrive 8:03
        </text>
      </>
    ),
  },
  "l1-pin": {
    label: "A flag tucked on the right of the green just over a deep bunker",
    draw: (
      <>
        <ellipse cx={100} cy={44} rx={72} ry={32} fill={GREEN} />
        <ellipse cx={150} cy={76} rx={28} ry={11} fill={SAND} stroke="#b89a55" strokeWidth={1} />
        <Flag x={152} y={56} />
        <Ball x={100} y={102} />
        <Label x={150} y={98}>Deep bunker</Label>
      </>
    ),
  },
  "l1-water-left": {
    label: "A fairway with water all down the left",
    draw: (
      <>
        <rect x={18} y={0} width={46} height={110} fill={WATER} />
        {[18, 44, 70, 96].map((y) => (
          <path key={y} d={`M28 ${y} q 6 -4 12 0 t 12 0`} fill="none" stroke="white" strokeOpacity={0.5} />
        ))}
        {[10, 30, 50, 70, 90].map((y) => (
          <rect key={y} x={62.5} y={y - 4} width={3} height={8} rx={1} fill="#ef4444" />
        ))}
        <path d="M72 110 L74 0 L138 0 L140 110 Z" fill={FAIRWAY} />
        <ellipse cx={106} cy={20} rx={18} ry={8} fill={GREEN} />
        <Flag x={106} y={22} />
        <Tee x={106} y={100} />
        <Label x={41} y={60}>Water</Label>
      </>
    ),
  },
  "l1-lag": {
    label: "A long 15 metre putt across the green",
    draw: (
      <>
        <ellipse cx={100} cy={55} rx={92} ry={46} fill={GREEN} />
        <path d="M26 74 C 70 70, 130 50, 172 42" fill="none" stroke="white" strokeOpacity={0.6} strokeWidth={1.4} strokeDasharray="4 4" />
        <Ball x={24} y={75} />
        <Flag x={174} y={42} />
        <Label x={100} y={74}>15 m</Label>
      </>
    ),
  },
  "l1-chip": {
    label: "A ball just off the green on short grass",
    draw: (
      <>
        <ellipse cx={122} cy={50} rx={70} ry={38} fill={FAIRWAY} />
        <ellipse cx={122} cy={50} rx={62} ry={31} fill={GREEN} />
        <Flag x={138} y={50} />
        <Ball x={58} y={70} />
        <Label x={42} y={92}>Short grass</Label>
      </>
    ),
  },
  "l1-headwind": {
    label: "A hole playing straight into a strong wind",
    draw: (
      <>
        <path d={FAIRWAY_PATH} fill={FAIRWAY} />
        <ellipse cx={105} cy={20} rx={20} ry={9} fill={GREEN} />
        <Flag x={105} y={22} />
        <Tee x={105} y={100} />
        {[
          [36, 22],
          [160, 34],
          [44, 62],
          [168, 74],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`} stroke="white" strokeOpacity={0.85} strokeWidth={2} strokeLinecap="round" fill="none">
            <line x1={x} y1={y} x2={x} y2={y! + 22} />
            <path d={`M${x! - 5} ${y! + 16} L${x} ${y! + 23} L${x! + 5} ${y! + 16}`} />
          </g>
        ))}
        <Label x={36} y={100}>Wind</Label>
      </>
    ),
  },
  "l1-fairway-bunker": {
    label: "Side view of a ball in a fairway bunker close to a high lip",
    draw: (
      <>
        <rect width={200} height={110} fill={SKY} />
        <path d="M0 56 L56 56 C 70 86, 84 90, 100 90 L134 90 C 146 90, 150 72, 150 40 L200 40 L200 110 L0 110 Z" fill={SAND} />
        <rect x={0} y={56} width={56} height={54} fill={FAIRWAY} />
        <rect x={150} y={40} width={50} height={70} fill={FAIRWAY} />
        <Ball x={128} y={86.8} />
        <Label x={150} y={32}>High lip</Label>
        <Label x={30} y={76}>Fairway</Label>
      </>
    ),
  },
  "l1-downhill": {
    label: "Side view of a putt running down a slope to the hole",
    draw: (
      <>
        <rect width={200} height={110} fill={SKY} />
        <path d="M0 40 L200 92 L200 110 L0 110 Z" fill={GREEN} />
        <Ball x={30} y={44} />
        <path d="M38 50 C 80 60, 120 72, 162 82" fill="none" stroke="white" strokeOpacity={0.7} strokeWidth={1.4} strokeDasharray="4 4" />
        <Flag x={170} y={84} />
        <Label x={60} y={92}>Downhill</Label>
      </>
    ),
  },
  "l1-layup": {
    label: "A par 5 with a creek crossing short of the green",
    draw: (
      <>
        <path d={FAIRWAY_PATH} fill={FAIRWAY} />
        <rect x={0} y={30} width={200} height={10} fill={WATER} />
        <ellipse cx={105} cy={16} rx={20} ry={8} fill={GREEN} />
        <Flag x={105} y={18} />
        <Ball x={110} y={96} />
        <Label x={40} y={26}>Creek</Label>
        <Label x={168} y={100}>Par 5</Label>
      </>
    ),
  },
  "l1-trees": {
    label: "A ball in the trees with a small gap to the green and a wide gap back to the fairway",
    draw: (
      <>
        <rect x={0} y={88} width={200} height={22} fill={FAIRWAY} />
        <ellipse cx={110} cy={18} rx={22} ry={8} fill={GREEN} />
        <Flag x={112} y={20} />
        {[23, 41, 59, 77, 95, 125, 143, 161, 179].map((x) => (
          <Tree key={`a${x}`} x={x} y={46} r={11} />
        ))}
        {[20, 42, 64, 88, 132, 156, 180].map((x) => (
          <Tree key={`b${x}`} x={x} y={66} r={10} />
        ))}
        <Ball x={110} y={68} />
        <Label x={150} y={100}>Fairway</Label>
      </>
    ),
  },
};

export function hasGolfIqPicture(questionId: string): boolean {
  return questionId in PICTURES;
}

/** Picture for a quiz question, or null when the question has none. */
export function GolfIqPicture({ questionId }: { questionId: string }) {
  const picture = PICTURES[questionId];
  if (!picture) return null;
  return (
    <svg viewBox="0 0 200 110" className="h-auto w-full rounded-xl" role="img" aria-label={picture.label}>
      <rect width={200} height={110} fill={ROUGH} />
      {picture.draw}
    </svg>
  );
}
