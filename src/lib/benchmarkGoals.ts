/** Linear scaling: maps handicap from 54 to +5 (-5) to goal percentages / targets. */
export const getBenchmarkGoals = (handicap: number) => {
  const clampedHandicap = Math.max(-5, Math.min(54, handicap));
  const normalized = (54 - clampedHandicap) / (54 - (-5));

  const gir = 8 + (70 - 8) * normalized;
  const fir = 15 + (75 - 15) * normalized;
  const upAndDown = 10 + (65 - 10) * normalized;
  // Putts per round: realistic benchmarks (54→41.5, 15→34.2, 5→31.7, 0→30.1)
  const getPuttsGoal = (h: number) => {
    if (h >= 54) return 41.5;
    if (h <= 0) return 30.1;
    if (h >= 15) return 34.2 + (41.5 - 34.2) * (54 - h) / (54 - 15);
    if (h >= 5) return 31.7 + (34.2 - 31.7) * (15 - h) / (15 - 5);
    return 30.1 + (31.7 - 30.1) * (5 - h) / 5;
  };
  const putts = getPuttsGoal(clampedHandicap);
  const bunkerSaves = 10 + (50 - 10) * normalized;
  const within8ft = 3 + (15 - 3) * normalized;
  const within20ft = 15 + (50 - 15) * normalized;
  const chipsInside6ft = 30 + (70 - 30) * normalized;
  const puttMake6ft = 60 + (95 - 60) * normalized;
  const score = clampedHandicap + 72;
  const birdies = 0 + (3.5 - 0) * normalized;
  const pars = 5 + (13.5 - 5) * normalized;
  const bogeys = 10 - (10 - 3) * normalized;
  const doubleBogeys = 10 - (10 - 0) * normalized;
  const teePenalties = 2 - (2 - 0) * normalized;
  const approachPenalties = 2 - (2 - 0) * normalized;
  const totalPenalties = teePenalties + approachPenalties;

  return {
    score: Math.round(score),
    gir: Math.round(gir),
    fir: Math.round(fir),
    upAndDown: Math.round(upAndDown),
    putts: Math.round(putts * 10) / 10,
    bunkerSaves: Math.round(bunkerSaves),
    within8ft: Math.round(within8ft),
    within20ft: Math.round(within20ft),
    chipsInside6ft: Math.round(chipsInside6ft),
    puttMake6ft: Math.round(puttMake6ft),
    birdies: Math.round(birdies * 10) / 10,
    pars: Math.round(pars * 10) / 10,
    eagles: 0,
    bogeys: Math.round(bogeys * 10) / 10,
    doubleBogeys: Math.round(doubleBogeys * 10) / 10,
    teePenalties: Math.round(teePenalties * 10) / 10,
    approachPenalties: Math.round(approachPenalties * 10) / 10,
    totalPenalties: Math.round(totalPenalties * 10) / 10,
  };
};
