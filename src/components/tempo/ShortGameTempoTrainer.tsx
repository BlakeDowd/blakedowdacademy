"use client";

import { BRAND_GREEN, SwingTempoTrainer, type TempoPreset, type TempoTrainerConfig } from "./SwingTempoTrainer";

export const SHORT_GAME_PRESETS: readonly TempoPreset[] = [
  { back: 14, down: 7, label: "Quick clip / tight lie" },
  { back: 16, down: 8 },
  { back: 18, down: 9, label: "Short Game Baseline" },
  { back: 20, down: 10 },
  { back: 22, down: 11 },
  { back: 24, down: 12, label: "Soft flop / bunker touch" },
];

/** Face-on golfer in a narrow chipping stance, club just starting back. */
function ChipTakeawaySilhouette() {
  return (
    <svg viewBox="0 0 120 160" className="h-full w-auto" fill="none" stroke={BRAND_GREEN} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M53 95 L34 143" strokeWidth={3} />
      <path d="M34 143 L25 145" strokeWidth={5} />
      <path d="M59 47 L60 87" strokeWidth={15} />
      <path d="M52 51 L53 95" strokeWidth={6} />
      <path d="M67 51 L55 95" strokeWidth={7} />
      <path d="M56 89 L53 117 L51 146" strokeWidth={9} />
      <path d="M64 89 L66 117 L68 146" strokeWidth={9} />
      <path d="M45 147 L55 147 M65 147 L75 147" strokeWidth={5} />
      <circle cx={59} cy={33} r={9.5} fill={BRAND_GREEN} stroke="none" />
    </svg>
  );
}

export const SHORT_GAME_TEMPO_CONFIG: TempoTrainerConfig = {
  title: "Short Game Tempo",
  subtitle: "2:1 backswing to downswing · chipping & pitching",
  ratio: 2,
  presets: SHORT_GAME_PRESETS,
  defaultPresetIndex: 2,
  resetSec: 2,
  silhouette: <ChipTakeawaySilhouette />,
};

export default function ShortGameTempoTrainer({ hideHeader = false }: { hideHeader?: boolean }) {
  return <SwingTempoTrainer hideHeader={hideHeader} config={SHORT_GAME_TEMPO_CONFIG} />;
}
