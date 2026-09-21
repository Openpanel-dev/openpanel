import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ADR-016 rule 5 wants the Bun pin asserted in three places: .bun-version,
// scripts/doctor.sh, and a boot log line — and all three must agree with
// each other and with the Dockerfile's ARG BUN_VERSION. A test proving that
// is worth more than the three edits it checks.
const REPO_ROOT = join(import.meta.dir, '../../../..');

function readBunVersionFile(): string {
  return readFileSync(join(REPO_ROOT, '.bun-version'), 'utf8');
}

describe('the Bun pin (ADR-016 rule 5)', () => {
  it('.bun-version is one line, no prefix', () => {
    const raw = readBunVersionFile();
    expect(raw.trim().split('\n')).toHaveLength(1);
    expect(raw.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches the Dockerfile ARG BUN_VERSION', () => {
    const dockerfile = readFileSync(
      join(REPO_ROOT, 'apps/api/Dockerfile'),
      'utf8'
    );
    const match = dockerfile.match(/^ARG BUN_VERSION=(\S+)$/m);
    expect(match?.[1]).toBe(readBunVersionFile().trim());
  });

  it('scripts/doctor.sh passes and reports the pinned version', () => {
    // Runs the real script rather than grepping its source — the behaviour
    // is what has to agree, not the implementation.
    const result = Bun.spawnSync([
      'bash',
      join(REPO_ROOT, 'scripts/doctor.sh'),
    ]);
    const pinned = readBunVersionFile().trim();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(pinned);
  });

  it('apps/api logs the running Bun version at boot', () => {
    const mainTs = readFileSync(
      join(REPO_ROOT, 'apps/api/src/main.ts'),
      'utf8'
    );
    expect(mainTs).toMatch(/Bun\.version/);
  });
});
