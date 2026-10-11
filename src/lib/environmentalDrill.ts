import { calculateElitePlaysLikeTarget } from "@/lib/playsLikeCalculator";

/**
 * "Environmental" (MENT-ENVI-103): 10 range shots, each with random course conditions to plan for.
 * Distances in metres, wind in km/h, temperature in °C.
 */

export const ENVIRONMENTAL_DRILL_KEY = "MENT-ENVI-103";
export const ENVIRONMENTAL_SHOTS = 10;
export const ENVIRONMENTAL_SCORE_TYPE = `makes/${ENVIRONMENTAL_SHOTS}`;

export type WindDir = "into" | "helping" | "leftToRight" | "rightToLeft";
export type Greens = "firm" | "normal" | "soft";
export type Lie = "fairway" | "flyer" | "tight";
export type PinSpot = "front" | "middle" | "back" | "left" | "right";
export type Trouble = "water short" | "bunker short" | "trouble long" | "bunker left" | "water right" | null;
export type Finish = "green" | "short" | "long" | "left" | "right";

export type Scenario = {
  distance: number;
  wind: { kmh: number; dir: WindDir } | null;
  tempC: number;
  rain: boolean;
  elevation: number;
  greens: Greens;
  lie: Lie;
  pin: PinSpot;
  trouble: Trouble;
};

export type EnvironmentalShot = { scenario: Scenario; finish: Finish };
export type EnvironmentalDetails = { kind: "environmental"; shots: EnvironmentalShot[] };

export const FINISH_LABELS: Record<Finish, string> = {
  green: "On the green",
  short: "Short",
  long: "Long",
  left: "Left",
  right: "Right",
};

export const WIND_LABELS: Record<WindDir, string> = {
  into: "into you",
  helping: "helping",
  leftToRight: "left to right",
  rightToLeft: "right to left",
};

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
const between = (min: number, max: number, step = 1) =>
  min + Math.floor(Math.random() * (Math.floor((max - min) / step) + 1)) * step;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 10 shots with a spread of conditions: every wind direction, some calm, some cold, some hot, mixed greens. */
export function randomScenarios(count = ENVIRONMENTAL_SHOTS): Scenario[] {
  const winds = shuffle<WindDir | null>(["into", "into", "helping", "helping", "leftToRight", "leftToRight", "rightToLeft", "rightToLeft", null, null]);
  const temps = shuffle(["cold", "cold", "hot", "hot", "mild", "mild", "mild", "mild", "mild", "mild"] as const);
  const lies = shuffle<Lie>(["fairway", "fairway", "fairway", "fairway", "fairway", "fairway", "flyer", "flyer", "tight", "tight"]);
  return Array.from({ length: count }, (_, i) => {
    const dir = winds[i % winds.length] ?? null;
    const temp = temps[i % temps.length]!;
    const tempC = temp === "cold" ? between(2, 10) : temp === "hot" ? between(30, 38) : between(16, 24);
    const rain = temp !== "hot" && Math.random() < 0.25;
    const greens: Greens = rain ? pick(["soft", "soft", "normal"]) : temp === "hot" ? pick(["firm", "firm", "normal"]) : pick(["firm", "normal", "soft"]);
    const pin = pick<PinSpot>(["front", "middle", "back", "left", "right"]);
    const trouble: Trouble =
      Math.random() < 0.35
        ? null
        : pin === "front"
          ? pick(["water short", "bunker short"])
          : pin === "back"
            ? "trouble long"
            : pin === "left"
              ? "bunker left"
              : pin === "right"
                ? "water right"
                : pick(["bunker short", "trouble long"]);
    return {
      distance: between(80, 170, 5),
      wind: dir ? { kmh: between(10, 35, 5), dir } : null,
      tempC,
      rain,
      elevation: Math.random() < 0.4 ? pick([-12, -8, -5, 5, 8, 12]) : 0,
      greens,
      lie: lies[i % lies.length]!,
      pin,
      trouble,
    };
  });
}

const RELEASE_M: Record<Greens, number> = { firm: 7, normal: 3, soft: 0 };

export type ShotPlan = {
  playsLike: number;
  carry: number;
  release: number;
  aim: { metres: number; side: "left" | "right" } | null;
  calls: string[];
};

/** The plays-like number, the carry to fly it and how to play it. */
export function planShot(s: Scenario): ShotPlan {
  const windDir = s.wind?.dir === "into" ? "head" : s.wind?.dir === "helping" ? "tail" : s.wind ? (s.wind.dir === "leftToRight" ? "leftToRight" : "rightToLeft") : "none";
  let playsLike =
    calculateElitePlaysLikeTarget(s.distance, s.elevation, s.wind?.kmh ?? 0, windDir, s.wind?.dir === "into" ? "low" : "standard") ?? s.distance;
  playsLike *= 1 + (20 - s.tempC) * 0.002;
  if (s.rain) playsLike *= 1.03;
  if (s.lie === "flyer") playsLike *= 0.95;
  const downwindRelease = s.wind?.dir === "helping" ? 2 : 0;
  const release = s.greens === "soft" ? 0 : RELEASE_M[s.greens] + downwindRelease + (s.lie === "flyer" ? 3 : 0);
  const pl = Math.round(playsLike);

  const cross = s.wind && (s.wind.dir === "leftToRight" || s.wind.dir === "rightToLeft") ? s.wind : null;
  const aim = cross
    ? { metres: Math.max(2, Math.round(cross.kmh * 0.35 * (s.distance / 150))), side: cross.dir === "leftToRight" ? ("left" as const) : ("right" as const) }
    : null;

  const calls: string[] = [];
  if (s.wind?.dir === "into") {
    calls.push(
      s.wind.kmh >= 20
        ? "Strong wind into you: take 1–2 extra clubs, grip down and make a smooth three-quarter swing to keep it low."
        : "Wind into you: take an extra club and swing smooth. Swinging harder adds spin and the ball balloons.",
    );
  } else if (s.wind?.dir === "helping") {
    calls.push("Wind helping: the ball flies further and won't stop as quickly. Take less club and land it shorter.");
  } else if (aim) {
    calls.push(`Crosswind: aim about ${aim.metres} m ${aim.side} of the pin and let the wind bring it back.`);
  }
  if (s.tempC <= 10) calls.push(`Cold (${s.tempC}°C): the ball flies shorter in cold air. Add a few metres and keep your hands warm.`);
  if (s.tempC >= 30) calls.push(`Hot (${s.tempC}°C): warm air carries the ball further. Take a few metres off.`);
  if (s.rain) calls.push("Rain: dry your grips, grip a touch firmer and expect a little less carry.");
  if (s.elevation > 0) calls.push(`${s.elevation} m uphill to the green: it plays longer and lands softer.`);
  if (s.elevation < 0) calls.push(`${-s.elevation} m downhill to the green: it plays shorter and will release.`);
  if (s.lie === "flyer") calls.push("Light rough: expect a flyer with less spin. It goes further and runs out, so take less club.");
  if (s.lie === "tight") calls.push("Tight lie: ball a touch back, hit ball first. Don't try to help it up.");
  if (s.greens === "firm") calls.push(`Firm greens: land it about ${release} m short and let it run up.`);
  if (s.greens === "soft") calls.push("Soft greens: it'll stop where it lands, so fly it all the way to the pin.");
  const strategy = strategyCall(s);
  if (strategy) calls.push(strategy);

  return { playsLike: pl, carry: Math.max(0, pl - release), release, aim, calls };
}

function strategyCall(s: Scenario): string | null {
  if (s.trouble === "water short") return "Water short of the green: make sure you get past the front edge. Long is fine.";
  if (s.trouble === "bunker short") return "Bunker short: commit to carrying it. Being a few metres long is the safe miss.";
  if (s.trouble === "trouble long") return "Trouble long: play to the middle of the green. Short of the pin is the safe miss.";
  if (s.trouble === "bunker left") return "Bunker left of a left pin: aim at the centre of the green and take the bunker out of play.";
  if (s.trouble === "water right") return "Water right of a right pin: aim at the centre of the green. Left is the safe miss.";
  if (s.pin === "middle") return "Middle pin: go at it.";
  return null;
}

export function pinLabel(s: Scenario): string {
  const pin = { front: "Front pin", middle: "Middle pin", back: "Back pin", left: "Pin left", right: "Pin right" }[s.pin];
  return s.trouble ? `${pin} · ${s.trouble}` : pin;
}

/** Condition groups a shot counts towards, for the report. */
export function scenarioTags(s: Scenario): string[] {
  const tags: string[] = [];
  if (!s.wind) tags.push("Calm");
  else if (s.wind.dir === "into") tags.push("Into the wind");
  else if (s.wind.dir === "helping") tags.push("Wind helping");
  else tags.push("Crosswind");
  if (s.tempC <= 10) tags.push("Cold");
  if (s.tempC >= 30) tags.push("Hot");
  if (s.rain) tags.push("Rain");
  if (s.greens === "firm") tags.push("Firm greens");
  if (s.greens === "soft") tags.push("Soft greens");
  if (s.lie === "flyer") tags.push("Flyer lie");
  if (s.lie === "tight") tags.push("Tight lie");
  if (s.elevation > 0) tags.push("Uphill");
  if (s.elevation < 0) tags.push("Downhill");
  if (s.trouble) tags.push("Trouble near the pin");
  return tags;
}

const TAG_TIPS: Record<string, string> = {
  "Into the wind": "Hit 5 balls into the wind with one extra club and a three-quarter swing. Hold the finish low.",
  "Wind helping": "Downwind, pick a landing spot short of the flag and let the ball run to it.",
  Crosswind: "Commit to an aim point into the wind and hold your line. Don't try to fight the wind with your swing.",
  Cold: "In the cold, add 1 club and keep hands warm between shots.",
  Hot: "In the heat, take a few metres off your number. The ball goes further.",
  Rain: "Practise with a wet towel nearby: dry grips, firmer hold, one extra club.",
  "Firm greens": "On firm greens, pick a landing spot short of the pin and play the bounce.",
  "Soft greens": "On soft greens, fly it all the way to the flag. It won't release.",
  "Flyer lie": "From light rough, take less club and plan for the ball to run out.",
  "Tight lie": "From tight lies, ball slightly back and hit down. Make a ball-first strike.",
  Uphill: "Uphill shots play longer. Add the elevation and trust the bigger number.",
  Downhill: "Downhill shots play shorter. Take some off and expect release.",
  "Trouble near the pin": "When there's trouble, aim for the middle of the green and favour the safe miss.",
};

export function environmentalReport(shots: EnvironmentalShot[]) {
  const greens = shots.filter((s) => s.finish === "green").length;
  const misses = {
    short: shots.filter((s) => s.finish === "short").length,
    long: shots.filter((s) => s.finish === "long").length,
    left: shots.filter((s) => s.finish === "left").length,
    right: shots.filter((s) => s.finish === "right").length,
  };

  const tagMap = new Map<string, { made: number; total: number }>();
  for (const s of shots) {
    for (const tag of scenarioTags(s.scenario)) {
      const t = tagMap.get(tag) ?? { made: 0, total: 0 };
      t.total += 1;
      if (s.finish === "green") t.made += 1;
      tagMap.set(tag, t);
    }
  }
  const conditions = [...tagMap.entries()]
    .map(([tag, t]) => ({ tag, ...t, rate: t.made / t.total }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total);
  const weakest = conditions.find((c) => c.total >= 2 && c.rate < 0.5) ?? null;

  const count = (pred: (s: EnvironmentalShot) => boolean) => shots.filter(pred).length;
  const findings: { n: number; title: string; line: string }[] = [
    {
      n: count((s) => s.scenario.wind?.dir === "into" && s.finish === "short"),
      title: "Practise: into-the-wind shots",
      line: "Into the wind you came up short. Take more club than feels right and swing easier.",
    },
    {
      n: count((s) => s.scenario.wind?.dir === "helping" && s.finish === "long"),
      title: "Practise: downwind shots",
      line: "Downwind you went long. Take less club and land it shorter.",
    },
    {
      n: count(
        (s) =>
          (s.scenario.wind?.dir === "leftToRight" && s.finish === "right") ||
          (s.scenario.wind?.dir === "rightToLeft" && s.finish === "left"),
      ),
      title: "Practise: aiming into crosswinds",
      line: "The crosswind blew you off the green. Aim further into the wind and trust it to bring the ball back.",
    },
    {
      n: count((s) => s.scenario.greens === "firm" && s.finish === "long"),
      title: "Practise: landing it short on firm greens",
      line: "On firm greens you ran through the back. Land it shorter and let it release.",
    },
    {
      n: count((s) => (s.scenario.tempC <= 10 || s.scenario.rain || s.scenario.elevation > 0) && s.finish === "short"),
      title: "Practise: adding distance when it plays long",
      line: "In cold, wet or uphill shots you came up short. Trust the plays-like number and take the extra club.",
    },
    {
      n: count((s) => s.scenario.trouble != null && s.finish !== "green" && troubleSide(s.scenario.trouble) === s.finish),
      title: "Practise: playing away from trouble",
      line: "You missed on the side of the trouble. Aim for the middle of the green and favour the safe side.",
    },
  ]
    .filter((f) => f.n >= 2)
    .sort((a, b) => b.n - a.n);

  const missTotal = shots.length - greens;
  const [topMiss, topMissN] = (Object.entries(misses) as [keyof typeof misses, number][]).sort((a, b) => b[1] - a[1])[0]!;

  let focus: { title: string; lines: string[] };
  if (greens === shots.length) {
    focus = { title: "Great adapting", lines: ["Every green hit. Try stronger conditions or longer shots next time."] };
  } else if (findings.length) {
    focus = { title: findings[0]!.title, lines: findings.slice(0, 2).map((f) => `${f.line} (${f.n} times)`) };
  } else if (missTotal >= 3 && topMissN / missTotal >= 0.6) {
    focus = {
      title: `Practise: your ${topMiss} miss`,
      lines: [
        `${topMissN} of your ${missTotal} misses were ${topMiss}.`,
        topMiss === "short"
          ? "You're under-clubbing. Take the bigger number when you're between clubs."
          : topMiss === "long"
            ? "You're over-clubbing. Trust the plays-like number and don't add extra for safety."
            : `Check your aim and alignment. Lay a club down on the range to see where you're really aimed.`,
      ],
    };
  } else if (weakest) {
    focus = {
      title: `Practise: ${weakest.tag.toLowerCase()}`,
      lines: [`You hit ${weakest.made} of ${weakest.total} greens there.`],
    };
  } else {
    focus = { title: "Practise: committing to the plan", lines: ["Misses were spread around. Pick the shot, commit, and swing."] };
  }
  if (weakest && TAG_TIPS[weakest.tag] && greens < shots.length) focus.lines.push(TAG_TIPS[weakest.tag]!);

  return { greens, misses, conditions, weakest: weakest?.tag ?? null, focus };
}

function troubleSide(t: Exclude<Trouble, null>): Finish {
  if (t === "water short" || t === "bunker short") return "short";
  if (t === "trouble long") return "long";
  if (t === "bunker left") return "left";
  return "right";
}
