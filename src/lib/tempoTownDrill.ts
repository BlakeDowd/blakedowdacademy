/** "Tempo town" (IRON-TETW-055): swing to the Full Swing Tempo trainer and log the reps. */

export const TEMPO_TOWN_DRILL_KEY = "IRON-TETW-055";
export const TEMPO_TOWN_SCORE_TYPE = "count: reps";

export type TempoTownDetails = {
  kind: "tempo_town";
  /** Reps per tempo, keyed like "21/7". */
  tempos: Record<string, number>;
};
