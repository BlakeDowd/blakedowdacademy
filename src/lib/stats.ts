export function calculatePuttingAccuracy(made6ftAndIn: number, puttsUnder6ftAttempts: number): number {
  if (!puttsUnder6ftAttempts || puttsUnder6ftAttempts === 0) return 0;
  return Math.round((made6ftAndIn / puttsUnder6ftAttempts) * 100);
}
