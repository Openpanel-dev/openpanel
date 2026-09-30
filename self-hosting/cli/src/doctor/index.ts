import { checks } from './checks';
import type { Finding, Install } from './types';

export type { Finding, Install, Severity } from './types';

export const runDoctor = (install: Install): Finding[] =>
  checks.flatMap((check) => check(install) ?? []);

// Fixes run one at a time against live state, in check order, so a later fix
// sees the result of an earlier one (the worker image before its role).
export const applyFixes = (install: Install): Finding[] => {
  const applied: Finding[] = [];
  for (const check of checks) {
    const finding = check(install);
    if (!finding?.fix) {
      continue;
    }
    finding.fix(install);
    applied.push(finding);
  }
  return applied;
};
