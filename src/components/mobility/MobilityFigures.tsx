import type { ReactNode } from "react";

type P = [number, number];

type Pose = {
  head: P;
  neck: P;
  hip: P;
  knees: [P, P];
  feet: [P, P];
  elbows: [P, P];
  hands: [P, P];
};

const INK = "#014421";
const MOVE = "#FFA500";
const PROP = "#9ca3af";

function Figure({ pose }: { pose: Pose }) {
  const limb = (pts: P[]) => pts.map((p) => p.join(",")).join(" ");
  return (
    <g stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polyline points={limb([pose.neck, pose.hip])} />
      <polyline points={limb([pose.hip, pose.knees[0], pose.feet[0]])} />
      <polyline points={limb([pose.hip, pose.knees[1], pose.feet[1]])} />
      <polyline points={limb([pose.neck, pose.elbows[0], pose.hands[0]])} />
      <polyline points={limb([pose.neck, pose.elbows[1], pose.hands[1]])} />
      <circle cx={pose.head[0]} cy={pose.head[1]} r={8} fill="currentColor" stroke="none" />
    </g>
  );
}

/** Orange movement arc with a dot on the end it moves towards. */
function Move({ d, end }: { d: string; end: P }) {
  return (
    <g>
      <path d={d} fill="none" stroke={MOVE} strokeWidth={2.5} strokeDasharray="4 3" strokeLinecap="round" />
      <circle cx={end[0]} cy={end[1]} r={3.5} fill={MOVE} />
    </g>
  );
}

function Floor({ y = 114 }: { y?: number }) {
  return <line x1={4} y1={y} x2={116} y2={y} stroke={PROP} strokeWidth={2} />;
}

const crossedArms = (y: number, x: number): Pick<Pose, "elbows" | "hands"> => ({
  elbows: [
    [x - 12, y + 10],
    [x + 12, y + 10],
  ],
  hands: [
    [x + 8, y + 4],
    [x - 8, y + 4],
  ],
});

const FIGURES: Record<string, ReactNode> = {
  "pelvic-tilt": (
    <>
      <Floor />
      <Figure
        pose={{
          head: [74, 22],
          neck: [66, 32],
          hip: [46, 64],
          knees: [
            [56, 88],
            [56, 88],
          ],
          feet: [
            [50, 113],
            [50, 113],
          ],
          ...crossedArms(32, 64),
        }}
      />
      <Move d="M30 52 A 18 18 0 0 0 30 78" end={[30, 78]} />
    </>
  ),
  "pelvic-rotation": (
    <>
      <Floor />
      <Figure
        pose={{
          head: [60, 18],
          neck: [60, 30],
          hip: [60, 64],
          knees: [
            [50, 88],
            [70, 88],
          ],
          feet: [
            [46, 113],
            [74, 113],
          ],
          ...crossedArms(30, 60),
        }}
      />
      <Move d="M34 66 A 26 8 0 0 0 86 66" end={[86, 66]} />
    </>
  ),
  "seated-trunk": (
    <>
      <Floor />
      <g stroke={PROP} strokeWidth={3} strokeLinecap="round">
        <line x1={38} y1={70} x2={74} y2={70} />
        <line x1={40} y1={70} x2={40} y2={113} />
        <line x1={72} y1={70} x2={72} y2={113} />
        <line x1={38} y1={70} x2={38} y2={34} />
      </g>
      <Figure
        pose={{
          head: [50, 16],
          neck: [50, 28],
          hip: [48, 66],
          knees: [
            [80, 66],
            [80, 66],
          ],
          feet: [
            [80, 104],
            [80, 104],
          ],
          elbows: [
            [60, 36],
            [60, 36],
          ],
          hands: [
            [52, 32],
            [52, 32],
          ],
        }}
      />
      <line x1={30} y1={30} x2={72} y2={30} stroke={PROP} strokeWidth={3} strokeLinecap="round" />
      <Move d="M24 18 A 30 10 0 0 0 80 18" end={[80, 18]} />
    </>
  ),
  "deep-squat": (
    <>
      <Floor />
      <Figure
        pose={{
          head: [50, 46],
          neck: [54, 57],
          hip: [40, 86],
          knees: [
            [70, 84],
            [70, 84],
          ],
          feet: [
            [56, 113],
            [56, 113],
          ],
          elbows: [
            [66, 38],
            [66, 38],
          ],
          hands: [
            [68, 18],
            [68, 18],
          ],
        }}
      />
      <line x1={52} y1={18} x2={84} y2={18} stroke={PROP} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  "toe-touch": (
    <>
      <Floor />
      <Figure
        pose={{
          head: [78, 92],
          neck: [72, 80],
          hip: [52, 56],
          knees: [
            [52, 84],
            [52, 84],
          ],
          feet: [
            [52, 113],
            [52, 113],
          ],
          elbows: [
            [70, 96],
            [70, 96],
          ],
          hands: [
            [62, 110],
            [62, 110],
          ],
        }}
      />
      <Move d="M88 60 A 26 26 0 0 1 84 96" end={[84, 96]} />
    </>
  ),
  "shoulder-90-90": (
    <>
      <Floor />
      <Figure
        pose={{
          head: [60, 18],
          neck: [60, 30],
          hip: [60, 68],
          knees: [
            [52, 90],
            [68, 90],
          ],
          feet: [
            [50, 113],
            [70, 113],
          ],
          elbows: [
            [44, 52],
            [86, 32],
          ],
          hands: [
            [42, 72],
            [86, 8],
          ],
        }}
      />
      <Move d="M100 30 A 16 22 0 0 0 96 6" end={[96, 6]} />
    </>
  ),
  "single-leg-balance": (
    <>
      <Floor />
      <Figure
        pose={{
          head: [60, 18],
          neck: [60, 30],
          hip: [60, 64],
          knees: [
            [56, 88],
            [74, 80],
          ],
          feet: [
            [56, 113],
            [70, 100],
          ],
          ...crossedArms(30, 60),
        }}
      />
      <line x1={55} y1={17} x2={59} y2={17} stroke="white" strokeWidth={1.5} />
      <line x1={62} y1={17} x2={66} y2={17} stroke="white" strokeWidth={1.5} />
    </>
  ),
  "lat-length": (
    <>
      <Floor />
      <line x1={26} y1={2} x2={26} y2={114} stroke={PROP} strokeWidth={4} />
      <Figure
        pose={{
          head: [38, 22],
          neck: [36, 32],
          hip: [34, 68],
          knees: [
            [40, 90],
            [40, 90],
          ],
          feet: [
            [46, 113],
            [46, 113],
          ],
          elbows: [
            [36, 16],
            [36, 16],
          ],
          hands: [
            [32, 2],
            [32, 2],
          ],
        }}
      />
      <Move d="M86 30 A 40 40 0 0 0 44 4" end={[44, 4]} />
    </>
  ),
  "hip-rotation": (
    <>
      <Floor />
      <g stroke={PROP} strokeWidth={3} strokeLinecap="round">
        <line x1={36} y1={64} x2={84} y2={64} />
        <line x1={38} y1={64} x2={38} y2={113} />
        <line x1={82} y1={64} x2={82} y2={113} />
      </g>
      <Figure
        pose={{
          head: [60, 12],
          neck: [60, 24],
          hip: [60, 60],
          knees: [
            [52, 70],
            [68, 70],
          ],
          feet: [
            [52, 98],
            [90, 90],
          ],
          ...crossedArms(24, 60),
        }}
      />
      <Move d="M68 104 A 26 26 0 0 0 100 84" end={[100, 84]} />
    </>
  ),
  "bridge-extension": (
    <>
      <Floor y={108} />
      <Figure
        pose={{
          head: [12, 98],
          neck: [22, 96],
          hip: [62, 74],
          knees: [
            [84, 78],
            [90, 66],
          ],
          feet: [
            [88, 106],
            [116, 58],
          ],
          elbows: [
            [36, 104],
            [36, 104],
          ],
          hands: [
            [50, 106],
            [50, 106],
          ],
        }}
      />
      <Move d="M62 58 L 62 44" end={[62, 44]} />
    </>
  ),
  "neck-rotation": (
    <>
      <Floor />
      <Figure
        pose={{
          head: [60, 22],
          neck: [60, 34],
          hip: [60, 70],
          knees: [
            [52, 92],
            [68, 92],
          ],
          feet: [
            [50, 113],
            [70, 113],
          ],
          elbows: [
            [46, 52],
            [74, 52],
          ],
          hands: [
            [44, 70],
            [76, 70],
          ],
        }}
      />
      <path d="M60 22 L 70 20" stroke="white" strokeWidth={2} strokeLinecap="round" />
      <Move d="M42 10 A 20 10 0 0 0 80 10" end={[80, 10]} />
    </>
  ),
  "wrist-hinge": (
    <>
      <Floor />
      <Figure
        pose={{
          head: [32, 18],
          neck: [32, 30],
          hip: [32, 68],
          knees: [
            [30, 90],
            [36, 90],
          ],
          feet: [
            [28, 113],
            [38, 113],
          ],
          elbows: [
            [56, 34],
            [34, 52],
          ],
          hands: [
            [80, 36],
            [36, 70],
          ],
        }}
      />
      <line x1={80} y1={36} x2={88} y2={22} stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
      <Move d="M100 40 A 14 18 0 0 0 96 14" end={[96, 14]} />
    </>
  ),
};

export function MobilityFigure({ testId, className = "", light = false }: { testId: string; className?: string; light?: boolean }) {
  const figure = FIGURES[testId];
  if (!figure) return null;
  return (
    <svg viewBox="0 0 120 120" className={className} style={{ color: light ? "white" : INK }} aria-hidden>
      {figure}
    </svg>
  );
}
