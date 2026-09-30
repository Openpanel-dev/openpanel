import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import OpenAI from 'openai';
import { git, lines } from './git';

// OpenAI's top model: there are only a handful of public releases a year, and
// these notes are what self-hosters read, so quality wins over cost here.
const MODEL = 'gpt-6-astra';
const REASONING_EFFORT = 'high';
const FIELD = '\u001f';
const RECORD = '\u001e';

// Markers only steer CI (debounce, version bump); they are noise in the notes.
const CI_MARKERS = /\s*\[(release now|minor|major)\]/gi;

// Paths whose changes mean a self-hoster may have to act when upgrading.
export const UPGRADE_SENSITIVE_PATHS = [
  'self-hosting/',
  'apps/api/src/config/env.ts',
  'packages/db/prisma/migrations/',
  'packages/db/src/code-migrations/',
  'apps/api/Dockerfile',
  'apps/start/Dockerfile',
] as const;

export interface Commit {
  sha: string;
  subject: string;
  body: string;
}

export interface NotesInput {
  version: string;
  previous: string;
  commits: Commit[];
  sensitivePaths: string[];
  compareUrl: string | null;
}

export const stripMarkers = (text: string): string =>
  text.replace(CI_MARKERS, '').trim();

export const isUpgradeSensitive = (path: string): boolean =>
  UPGRADE_SENSITIVE_PATHS.some(
    (prefix) => path === prefix || path.startsWith(prefix)
  );

const compareLine = (input: NotesInput) =>
  input.compareUrl ? `\n\n**Full changelog:** ${input.compareUrl}` : '';

// Used when the API is unavailable: accurate, just unsummarised.
export const fallbackNotes = (input: NotesInput): string => {
  const items = input.commits.map(
    (commit) => `- ${stripMarkers(commit.subject)} (${commit.sha.slice(0, 7)})`
  );
  return `## Changes since v${input.previous}\n\n${items.join('\n')}${compareLine(input)}\n`;
};

const SYSTEM_PROMPT = `You write release notes for OpenPanel, an open-source product analytics tool that people self-host with Docker Compose and upgrade with the \`openpanel\` CLI.

You get the commit messages between two releases, and the list of changed files that can affect a self-hosted install. Write Markdown release notes for the people running it.

Rules:
- Describe only what the commit messages say. Never invent features, numbers, or behaviour, and do not guess at what an unexplained change does.
- Group into these sections, leaving out any that would be empty: "Highlights" (at most 3 bullets, only for changes a user would notice), "Added", "Changed", "Fixed", "Upgrade notes".
- "Upgrade notes" covers anything a self-hoster must know or do: new or renamed environment variables, compose changes, migrations, removed features. Base it on the commits and the changed-files list. Mention that \`openpanel upgrade\` applies the compose and .env changes when the commits say so.
- Leave out purely internal work (CI, tests, lint, refactors with no visible effect); if the release is only that, write a single line saying it contains internal improvements.
- One line per bullet, plain language, no commit hashes, no author names, no marketing tone.
- Do not start with a title; the release already has one.`;

const userPrompt = (input: NotesInput): string => {
  const commits = input.commits
    .map(
      (commit) =>
        `### ${stripMarkers(commit.subject)}\n${stripMarkers(commit.body)}`
    )
    .join('\n\n');
  const sensitive =
    input.sensitivePaths.length > 0
      ? input.sensitivePaths.join('\n')
      : '(none)';
  return `Release v${input.version} (previous release: v${input.previous}).\n\nChanged files that can affect a self-hosted install:\n${sensitive}\n\nCommits:\n\n${commits}`;
};

interface Generated {
  markdown: string;
  source: 'model' | 'fallback';
  reason?: string;
}

const fallback = (input: NotesInput, reason: string): Generated => ({
  markdown: fallbackNotes(input),
  source: 'fallback',
  reason,
});

export const generateNotes = async (
  input: NotesInput,
  client: OpenAI | null
): Promise<Generated> => {
  if (!client) {
    return fallback(input, 'no API key');
  }
  try {
    const response = await client.responses.create({
      model: MODEL,
      reasoning: { effort: REASONING_EFFORT },
      instructions: SYSTEM_PROMPT,
      input: userPrompt(input),
    });
    // `incomplete` (cut off or declined) must not publish half a note.
    if (response.status !== 'completed') {
      return fallback(input, `response ${response.status}`);
    }
    const text = response.output_text.trim();
    if (!text) {
      return fallback(input, 'empty response');
    }
    return { markdown: `${text}${compareLine(input)}\n`, source: 'model' };
  } catch (error) {
    return fallback(input, (error as Error).message);
  }
};

export const readCommits = (from: string, to: string): Commit[] =>
  git(
    'log',
    '--no-merges',
    `--format=%H${FIELD}%s${FIELD}%b${RECORD}`,
    `${from}..${to}`
  )
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = '', subject = '', body = ''] = record.split(FIELD);
      return { sha, subject, body: body.trim() };
    });

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      out: { type: 'string', default: 'release-notes.md' },
    },
  });
  if (!(values.from && values.to)) {
    throw new Error(
      'Usage: release-notes.ts --from v3.0.0 --to v3.1.0 [--out notes.md]'
    );
  }
  const repository = process.env.GITHUB_REPOSITORY;
  const input: NotesInput = {
    version: values.to.replace(/^v/, ''),
    previous: values.from.replace(/^v/, ''),
    commits: readCommits(values.from, values.to),
    sensitivePaths: lines(
      git('diff', '--name-only', values.from, values.to)
    ).filter(isUpgradeSensitive),
    compareUrl: repository
      ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/compare/${values.from}...${values.to}`
      : null,
  };
  const client = process.env.OPENAI_API_KEY ? new OpenAI() : null;
  const notes = await generateNotes(input, client);
  writeFileSync(values.out, notes.markdown);
  const usage =
    notes.source === 'model'
      ? `written by ${MODEL}`
      : `plain commit list (${notes.reason})`;
  console.error(
    `${input.commits.length} commits, ${input.sensitivePaths.length} upgrade-sensitive files; notes ${usage} -> ${values.out}`
  );
}
