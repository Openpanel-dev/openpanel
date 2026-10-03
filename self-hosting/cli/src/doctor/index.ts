import { checks } from './checks';
import type { Finding, Install } from './types';

export type { Finding, Install, Severity } from './types';

export const runDoctor = (install: Install): Finding[] =>
  checks.flatMap((check) => check(install) ?? []);

// Fixes run one at a time against live state, in check order, so a later fix
// sees the result of an earlier one (the worker image before its role).
// `skip` leaves findings to the caller, e.g. `upgrade` asks about images itself.
export const applyFixes = (
  install: Install,
  { skip = [] }: { skip?: string[] } = {}
): Finding[] => {
  const applied: Finding[] = [];
  for (const check of checks) {
    const finding = check(install);
    if (!finding?.fix || skip.includes(finding.id)) {
      continue;
    }
    finding.fix(install);
    applied.push(finding);
  }
  return applied;
};
