/** Spec §2 / §5.1 — RIR-adjusted Epley estimate. `e1rm = weight × (1 + (reps + rir) / 30)`. */
export function e1rm(weight_kg: number, reps: number, rir: number): number {
  return weight_kg * (1 + (reps + rir) / 30);
}
