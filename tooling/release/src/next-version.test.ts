import { describe, expect, test } from 'bun:test';
import {
  bumpFor,
  highestBump,
  MINIMUM_VERSION,
  nextVersion,
} from './next-version';

describe('bumpFor', () => {
  test.each([
    ['fix(dashboard): stop double-encoding ids', 'patch'],
    ['self-hosting: fix what the review found', 'patch'],
    ['ci: faster builds', 'patch'],
    ['feat: funnels by cohort', 'minor'],
    ['feat(api): export endpoint', 'minor'],
    ['self-hosting: new doctor check [minor]', 'minor'],
    ['feat!: drop the v1 ingest route', 'major'],
    ['fix(api)!: rename the events field', 'major'],
    [
      'refactor: move ingest\n\nBREAKING CHANGE: KAFKA_BROKERS is required',
      'major',
    ],
    ['merge the rewrite [major]', 'major'],
  ] as const)('%s -> %s', (message, bump) => {
    expect(bumpFor(message)).toBe(bump);
  });

  test('"feat" only counts as the type, not anywhere in the subject', () => {
    expect(bumpFor('docs: describe the feat: syntax')).toBe('patch');
  });
});

describe('highestBump', () => {
  test('a push takes the largest bump among its commits', () => {
    expect(highestBump(['fix: a', 'feat: b', 'ci: c'])).toBe('minor');
    expect(highestBump(['fix: a', 'feat!: b'])).toBe('major');
    expect(highestBump([])).toBe('patch');
  });
});

describe('nextVersion', () => {
  test('bumps the previous release', () => {
    expect(nextVersion('3.1.4', 'patch')).toBe('3.1.5');
    expect(nextVersion('3.1.4', 'minor')).toBe('3.2.0');
    expect(nextVersion('3.1.4', 'major')).toBe('4.0.0');
  });

  test('never produces anything below the v3 floor', () => {
    expect(nextVersion(null, 'patch')).toBe(MINIMUM_VERSION);
    expect(nextVersion('2.3.0', 'patch')).toBe(MINIMUM_VERSION);
    expect(nextVersion('2.3.0', 'minor')).toBe(MINIMUM_VERSION);
  });
});
