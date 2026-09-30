import { appendFileSync } from 'node:fs';
import semver from 'semver';
import { git, gitOrNull, lines } from './git';

export type Bump = 'patch' | 'minor' | 'major';

// v3 is the first release numbered this way. Anything computed below it (the
// baseline tag is v2.3.0) is lifted to it, so v3 code can never ship as 2.3.x.
export const MINIMUM_VERSION = '3.0.0';
export const TAG_PREFIX = 'v';
const TAG_PATTERN = 'v[0-9]*';

const BUMP_RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };
const MAJOR_MARKER = '[major]';
const MINOR_MARKER = '[minor]';
// `feat:` / `feat(scope):` / `feat!:` is a feature; every other subject is a patch.
const FEATURE_SUBJECT = /^feat(\([^)]*\))?!?:/i;

// A major bump needs `[major]`, typed by the maintainer. Conventional-commit
// breaking markers (`feat!:`, a BREAKING CHANGE footer) are ignored on
// purpose: agents write most commits and add them out of habit, and a new
// major version is a release decision, not a side effect of one commit.
export const bumpFor = (message: string): Bump => {
  if (message.includes(MAJOR_MARKER)) {
    return 'major';
  }
  const subject = message.split('\n', 1)[0]?.trim() ?? '';
  const isFeature =
    message.includes(MINOR_MARKER) || FEATURE_SUBJECT.test(subject);
  return isFeature ? 'minor' : 'patch';
};

export const highestBump = (messages: string[]): Bump =>
  messages
    .map(bumpFor)
    .reduce<Bump>(
      (highest, bump) =>
        BUMP_RANK[bump] > BUMP_RANK[highest] ? bump : highest,
      'patch'
    );

export const nextVersion = (previous: string | null, bump: Bump): string => {
  const candidate = previous ? semver.inc(previous, bump) : null;
  if (!candidate || semver.lt(candidate, MINIMUM_VERSION)) {
    return MINIMUM_VERSION;
  }
  return candidate;
};

export type Decision =
  | { kind: 'existing'; version: string }
  | { kind: 'superseded'; by: string }
  | { kind: 'new'; version: string; previous: string | null; bump: Bump };

const versionOf = (tag: string) => semver.valid(tag.slice(TAG_PREFIX.length));

const highestVersion = (tags: string[]): string | null =>
  tags
    .map(versionOf)
    .filter((version): version is string => version !== null)
    .sort(semver.rcompare)[0] ?? null;

export const decide = (sha: string): Decision => {
  // A rerun of an already-tagged commit keeps its number.
  const existing = highestVersion(
    lines(gitOrNull('tag', '--points-at', sha, '--list', TAG_PATTERN))
  );
  if (existing) {
    return { kind: 'existing', version: existing };
  }
  // A later commit already released means this run finished late: tagging it
  // now would give an older commit a higher version.
  const newer = highestVersion(
    lines(gitOrNull('tag', '--contains', sha, '--list', TAG_PATTERN))
  );
  if (newer) {
    return { kind: 'superseded', by: newer };
  }

  const previousTag = gitOrNull(
    'describe',
    '--tags',
    '--abbrev=0',
    '--match',
    TAG_PATTERN,
    sha
  );
  const previous = previousTag ? versionOf(previousTag) : null;
  const range = previousTag ? `${previousTag}..${sha}` : sha;
  const messages = git('log', '--format=%B%x00', range)
    .split('\0')
    .filter((message) => message.trim());
  const bump = highestBump(messages);
  return { kind: 'new', version: nextVersion(previous, bump), previous, bump };
};

const writeOutputs = (outputs: Record<string, string>) => {
  const text = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, text);
  }
  process.stdout.write(text);
};

if (import.meta.main) {
  const sha = process.argv[2] ?? 'HEAD';
  const decision = decide(sha);
  if (decision.kind === 'superseded') {
    console.error(
      `${sha} is older than the released v${decision.by}; not tagging it.`
    );
    writeOutputs({ skip: 'true' });
  } else {
    const version = decision.version;
    const major = String(semver.major(version));
    console.error(
      decision.kind === 'existing'
        ? `${sha} is already v${version}`
        : `${decision.previous ?? 'no earlier tag'} + ${decision.bump} -> ${version}`
    );
    writeOutputs({
      skip: 'false',
      is_new: String(decision.kind === 'new'),
      version,
      minor: `${major}.${semver.minor(version)}`,
      major,
    });
  }
}
