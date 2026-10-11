import { BALL_FLIGHT_DRILL_KEY, BALL_FLIGHT_IRONS_DRILL_KEY } from "@/lib/ballFlightDrill";
import { FINGER_DISPERSION_DRILL_KEY } from "@/lib/fingerDispersionDrill";
import { FACE_STRIKE_DRILL_KEY } from "@/lib/faceStrikeDrill";
import { TEMPO_TOWN_DRILL_KEY } from "@/lib/tempoTownDrill";

/** Drills with their own scoring screen. Planner rows can carry the code, the catalogue UUID or only the name. */
const RUNNER_DRILLS = [
  { key: FACE_STRIKE_DRILL_KEY, ids: ["12388649-8cd3-4100-84d5-814952ee170e"], title: "hitting all parts of the face" },
  { key: BALL_FLIGHT_DRILL_KEY, ids: ["b2b576ef-9fe2-4940-81ae-000799d941d1"], title: "9 ball flight driver" },
  { key: BALL_FLIGHT_IRONS_DRILL_KEY, ids: ["e00fd094-673e-44e0-8279-000dd3ac404b"], title: "9 ball flight irons" },
  { key: FINGER_DISPERSION_DRILL_KEY, ids: ["2810a6ed-95fd-48c9-8afc-6c5988057152"], title: "finger dispersion 9 shots" },
  { key: TEMPO_TOWN_DRILL_KEY, ids: ["36efafaa-3ffd-44b1-854e-aca383bc0391"], title: "tempo town" },
] as const;

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** The drill code for drills that have a scoring screen, however the drill was added. */
export function runnerDrillKey(drill: {
  id?: string;
  drill_id?: string;
  title?: string;
  drill_name?: string;
}): string | null {
  const ids = [norm(drill.drill_id), norm(drill.id)].filter(Boolean);
  const titles = [norm(drill.title), norm(drill.drill_name)].filter(Boolean);
  for (const r of RUNNER_DRILLS) {
    const keys = [norm(r.key), ...r.ids.map(norm)];
    if (ids.some((id) => keys.includes(id)) || titles.includes(r.title)) return r.key;
  }
  return null;
}
