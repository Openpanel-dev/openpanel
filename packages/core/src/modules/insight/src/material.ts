import { severityBand as band } from './scoring';
import type {
  InsightDirection,
  MaterialDecision,
  PersistedInsight,
} from './types';

export function materialDecision(
  prev: PersistedInsight | null,
  next: {
    changePct?: number;
    direction?: InsightDirection;
  }
): MaterialDecision {
  const nextBand = band(next.changePct);
  if (!prev) {
    return { material: true, reason: 'created', newSeverityBand: nextBand };
  }

  // direction flip is always meaningful
  const prevDir = prev.direction ?? 'flat';
  const nextDir = next.direction ?? 'flat';
  if (prevDir !== nextDir && (nextDir === 'up' || nextDir === 'down')) {
    return {
      material: true,
      reason: 'direction_flip',
      newSeverityBand: nextBand,
    };
  }

  // severity band change
  const prevBand = prev.severityBand ?? null;
  if (prevBand !== nextBand && nextBand !== null) {
    return {
      material: true,
      reason: 'severity_change',
      newSeverityBand: nextBand,
    };
  }

  // Otherwise non-material (silent refresh).
  return {
    material: false,
    reason: 'none',
    newSeverityBand: prevBand ?? nextBand,
  };
}
