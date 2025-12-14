import { severityBand as band } from './scoring';
import type { MaterialDecision, PersistedInsight } from './types';

export function materialDecision(
  prev: PersistedInsight | null,
  next: {
    changePct?: number;
    direction?: 'up' | 'down' | 'flat';
  },
): MaterialDecision {
  const nextBand = band(next.changePct);
  if (!prev) {
    return { material: true, reason: 'created', newSeverityBand: nextBand };
  }

  // direction flip is always meaningful
  const prevDir = (prev.direction ?? 'flat') as any;
  const nextDir = next.direction ?? 'flat';
  if (prevDir !== nextDir && (nextDir === 'up' || nextDir === 'down')) {
    return {
      material: true,
      reason: 'direction_flip',
      newSeverityBand: nextBand,
    };
  }

  // severity band change
  const prevBand = (prev.severityBand ?? null) as any;
  if (prevBand !== nextBand && nextBand !== null) {
    return {
      material: true,
      reason: 'severity_change',
      newSeverityBand: nextBand,
    };
  }

  // Otherwise: treat as non-material (silent refresh). You can add deadband crossing here if you store prior changePct.
  return {
    material: false,
    reason: 'none',
    newSeverityBand: prevBand ?? nextBand,
  };
}
