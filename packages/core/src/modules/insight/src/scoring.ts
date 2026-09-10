import type { ComputeResult, SeverityBand } from './types';

export function defaultImpactScore(r: ComputeResult): number {
  const vol = (r.currentValue ?? 0) + (r.compareValue ?? 0);
  const pct = Math.abs(r.changePct ?? 0);
  // stable-ish: bigger change + bigger volume => higher impact
  return Math.log1p(vol) * (pct * 100);
}

export function severityBand(changePct?: number | null): SeverityBand | null {
  const p = Math.abs(changePct ?? 0);
  if (p < 0.1) {
    return null;
  }
  if (p < 0.5) {
    return 'low';
  }
  if (p < 1) {
    return 'moderate';
  }
  return 'severe';
}
