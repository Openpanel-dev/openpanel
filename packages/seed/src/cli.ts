// `bun run seed [--size small|medium|large|xl] [--days N --sessions-per-day N]
//               [--seed N] [--projects website,saas,...] [--timezone zone] [--reset]
//               [--dry-run] [--out path]`
//
// Targets whatever DATABASE_URL and CLICKHOUSE_URL name (a worktree's own
// databases). Same flags and seed ⇒ identical data.

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { db } from '@openpanel/db';
import { ARCHETYPE_IDS, ARCHETYPES, archetypeById } from './archetypes';
import { type GenerateConfig, generate, planDays } from './generator';
import { projectIdFor } from './ids';
import { buildManifest, describeManifest, writeManifest } from './manifest';
import { recordProjectStats, seedPostgres } from './postgres';
import { resetProjects } from './reset';
import { Rng } from './rng';
import {
  DEFAULT_SEED,
  DEFAULT_SIZE,
  MANIFEST_FILE,
  SIZE_PRESETS,
  type SizePreset,
} from './seed.constants';
import { ClickhouseSink } from './sink';

/** Sessions carry ~7 rows once session_start/session_end are added; only for the estimate. */
const EVENTS_PER_SESSION_ESTIMATE = 7;
const DEFAULT_VARIANCE = 1;
const MS_PER_DAY = 86_400_000;

const USAGE = `Usage: bun run seed [options]

  --size <${Object.keys(SIZE_PRESETS).join('|')}>   preset (default: ${DEFAULT_SIZE})
  --days <n>                       override the preset's day count
  --sessions-per-day <n>           override the preset's sessions per day (all projects)
  --seed <n>                       deterministic seed (default: ${DEFAULT_SEED})
  --projects <a,b>                 archetypes to seed (default: ${ARCHETYPE_IDS.join(',')})
  --timezone <zone>                the organization's timezone (default: this machine's)
  --variance <x>                   0 regular … 1 lively … 2 chaotic (default: ${DEFAULT_VARIANCE})
  --reset                          delete earlier seeded rows for these projects first
  --dry-run                        print the plan and exit
  --out <path>                     where to write the manifest (default: <repo>/${MANIFEST_FILE})
  --help
`;

function isPreset(value: string): value is SizePreset {
  return value in SIZE_PRESETS;
}

function integer(
  value: string | undefined,
  name: string,
  fallback: number
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
}

function maskedUrl(url: string | undefined): string {
  if (!url) {
    return '<unset>';
  }
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function machineTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      size: { type: 'string' },
      days: { type: 'string' },
      'sessions-per-day': { type: 'string' },
      seed: { type: 'string' },
      projects: { type: 'string' },
      variance: { type: 'string' },
      timezone: { type: 'string' },
      reset: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      out: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return Promise.resolve();
  }

  const size = values.size ?? DEFAULT_SIZE;
  if (!isPreset(size)) {
    throw new Error(`Unknown size "${size}". ${USAGE}`);
  }
  const preset = SIZE_PRESETS[size];
  const days = integer(values.days, 'days', preset.days);
  const sessionsPerDay = integer(
    values['sessions-per-day'],
    'sessions-per-day',
    preset.sessionsPerDay
  );
  const seed = integer(values.seed, 'seed', DEFAULT_SEED);
  const variance =
    values.variance === undefined ? DEFAULT_VARIANCE : Number(values.variance);
  const archetypes = values.projects
    ? values.projects.split(',').map((id) => archetypeById(id.trim()))
    : ARCHETYPES;
  const outPath =
    values.out ?? resolve(import.meta.dir, '..', '..', '..', MANIFEST_FILE);

  return run({
    size,
    days,
    sessionsPerDay,
    seed,
    variance,
    archetypes,
    timezone: values.timezone ?? machineTimezone(),
    reset: values.reset,
    dryRun: values['dry-run'],
    outPath,
  });
}

async function run(options: {
  size: SizePreset;
  days: number;
  sessionsPerDay: number;
  seed: number;
  variance: number;
  archetypes: typeof ARCHETYPES;
  timezone: string;
  reset: boolean;
  dryRun: boolean;
  outPath: string;
}): Promise<void> {
  const now = new Date();
  const config: GenerateConfig = {
    seed: options.seed,
    sessionsPerDay: options.sessionsPerDay,
    days: options.days,
    now,
    variance: options.variance,
    projects: options.archetypes.map((archetype) => ({
      archetype,
      projectId: projectIdFor(archetype),
    })),
  };

  const plannedSessions = planDays(config).reduce(
    (sum, day) => sum + day.sessions,
    0
  );
  console.log(`Postgres:   ${maskedUrl(process.env.DATABASE_URL)}`);
  console.log(`ClickHouse: ${maskedUrl(process.env.CLICKHOUSE_URL)}`);
  console.log(
    `Plan: ${options.days} days × ${options.sessionsPerDay} sessions/day (size ${options.size}, seed ${options.seed}) ≈ ${plannedSessions.toLocaleString()} sessions, ≈ ${(plannedSessions * EVENTS_PER_SESSION_ESTIMATE).toLocaleString()} events`
  );
  if (options.dryRun) {
    return;
  }

  const rng = new Rng(`${options.seed}/postgres`);
  const postgres = await seedPostgres(
    rng,
    options.archetypes,
    options.timezone
  );
  console.log(
    `Postgres ready: organization ${postgres.organizationId} (${options.timezone}), ${postgres.projects.length} projects`
  );

  if (options.reset) {
    console.log('Resetting earlier seeded rows…');
    await resetProjects(postgres.projects.map((project) => project.id));
  }

  const sink = new ClickhouseSink();
  const started = Date.now();
  const stats = await generate(config, sink, (progress) => {
    process.stdout.write(
      `\r${progress.day}  ${progress.sessions.toLocaleString()} sessions, ${progress.events.toLocaleString()} events`.padEnd(
        80
      )
    );
  });
  process.stdout.write('\n');
  console.log(`Inserted in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const perProject = new Map<string, { sessions: number; events: number }>();
  for (const project of stats) {
    perProject.set(project.projectId, {
      sessions: project.sessions,
      events: project.events,
    });
    await recordProjectStats(project.projectId, {
      eventsCount: project.events,
      firstEventAt: project.firstEventAt,
    });
  }

  const manifest = buildManifest({
    seed: options.seed,
    size: options.size,
    days: options.days,
    sessionsPerDay: options.sessionsPerDay,
    from: new Date(now.getTime() - options.days * MS_PER_DAY),
    to: now,
    postgres,
    apiUrl: process.env.API_URL ?? null,
    perProject,
    totals: sink.counts(),
  });
  writeManifest(options.outPath, manifest);
  console.log(describeManifest(manifest));
  console.log(`Manifest: ${options.outPath}`);
}

try {
  await main();
} finally {
  await db.$disconnect();
}
process.exit(0);
