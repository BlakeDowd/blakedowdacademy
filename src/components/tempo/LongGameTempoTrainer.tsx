"use client";

import { BRAND_GREEN, SwingTempoTrainer, type TempoPreset, type TempoTrainerConfig } from "./SwingTempoTrainer";

export const LONG_GAME_PRESETS: readonly TempoPreset[] = [
  { back: 18, down: 6, label: "Fast / Snappy" },
  { back: 21, down: 7, label: "PGA Tour Baseline" },
  { back: 24, down: 8, label: "Smooth / Deliberate" },
  { back: 27, down: 9, label: "Slow / Extended" },
  { back: 30, down: 10, label: "Deep rhythm" },
];

/** Face-on golfer coiled at the top of the backswing. */
function TopOfBackswingSilhouette() {
  return (
    <svg viewBox="0 0 120 160" className="h-full w-auto" fill="none" stroke={BRAND_GREEN} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M34 31 L96 17" strokeWidth={3} />
      <path d="M96 17 L101 24" strokeWidth={5} />
      <path d="M61 45 L63 86" strokeWidth={15} />
      <path d="M68 48 L36 31" strokeWidth={7} />
      <path d="M54 47 L44 41 L36 31" strokeWidth={6} />
      <path d="M58 88 L50 116 L45 146" strokeWidth={9} />
      <path d="M67 88 L68 116 L78 146" strokeWidth={9} />
      <path d="M39 147 L50 147 M74 147 L84 147" strokeWidth={5} />
      <circle cx={59} cy={30} r={9.5} fill={BRAND_GREEN} stroke="none" />
    </svg>
  );
}

export const LONG_GAME_TEMPO_CONFIG: TempoTrainerConfig = {
  title: "Full Swing Tempo",
  subtitle: "3:1 backswing to downswing · drivers, woods & irons",
  ratio: 3,
  presets: LONG_GAME_PRESETS,
  defaultPresetIndex: 1,
  resetSec: 2.5,
  silhouette: <TopOfBackswingSilhouette />,
  usageKey: "full-swing-tempo",
};

export default function LongGameTempoTrainer({ hideHeader = false }: { hideHeader?: boolean }) {
  return <SwingTempoTrainer hideHeader={hideHeader} config={LONG_GAME_TEMPO_CONFIG} />;
}
