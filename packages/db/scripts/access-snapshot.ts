// Dumps what every member may do on every project of their organization, so a
// data migration can be proven access-neutral: snapshot before, migrate,
// snapshot after, diff.
//
//   bun run --filter @openpanel/db access-snapshot --evaluator legacy  > before.json
//   bun run --filter @openpanel/db access-snapshot --evaluator current > after.json
//   bun run --filter @openpanel/db access-snapshot --diff before.json after.json [--expect keys.json]
//
// `legacy` is the rule the previous build applied, spelled out here from its
// tables (`project_access`, `members.role`), so it keeps answering after the
// app has moved on. `current` goes through core's public lookups, the same
// code every procedure calls, with each cache entry cleared first.
//
// Both tables are kept in step for one build, so both evaluators can run on
// the same database and must agree.

import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/core';
import {
  isOrganizationAdminRole,
  resolveOrganizationRole,
} from '@openpanel/core/modules/organization/organization.constants';
import { db } from '../src/prisma-client';

interface AccessLine {
  organizationId: string;
  userId: string;
  projectId: string;
  read: boolean;
  write: boolean;
  orgAdmin: boolean;
}

const LEGACY_ADMIN_ROLE = 'org:admin';
const LEGACY_WRITE_LEVELS = new Set(['write', 'admin']);

function lineKey(line: AccessLine): string {
  return `${line.organizationId}|${line.userId}|${line.projectId}`;
}

function sortLines(lines: AccessLine[]): AccessLine[] {
  return lines.sort((a, b) => lineKey(a).localeCompare(lineKey(b)));
}

async function loadMembers() {
  return db.member.findMany({
    where: { userId: { not: null } },
    select: {
      userId: true,
      organizationId: true,
      role: true,
      organization: {
        select: { projects: { select: { id: true } } },
      },
    },
  });
}

async function legacySnapshot(): Promise<AccessLine[]> {
  const [members, grants] = await Promise.all([
    loadMembers(),
    db.projectAccess.findMany({
      select: {
        userId: true,
        organizationId: true,
        projectId: true,
        level: true,
      },
    }),
  ]);
  const grantsByMember = new Map<string, typeof grants>();
  for (const grant of grants) {
    const key = `${grant.organizationId}|${grant.userId}`;
    grantsByMember.set(key, [...(grantsByMember.get(key) ?? []), grant]);
  }

  const lines: AccessLine[] = [];
  for (const member of members) {
    const userId = member.userId as string;
    const rows = grantsByMember.get(`${member.organizationId}|${userId}`) ?? [];
    const orgAdmin = member.role === LEGACY_ADMIN_ROLE;
    for (const project of member.organization.projects) {
      const row = rows.find((grant) => grant.projectId === project.id);
      const level = rows.length === 0 ? 'write' : row?.level;
      lines.push({
        organizationId: member.organizationId,
        userId,
        projectId: project.id,
        read: level !== undefined,
        write: level !== undefined && LEGACY_WRITE_LEVELS.has(level),
        orgAdmin,
      });
    }
  }
  return sortLines(lines);
}

async function currentSnapshot(): Promise<AccessLine[]> {
  const members = await loadMembers();
  const lines: AccessLine[] = [];
  for (const member of members) {
    const userId = member.userId as string;
    const organizationId = member.organizationId;
    await getOrganizationAccess.clear({ userId, organizationId });
    const organizationAccess = await getOrganizationAccess({
      userId,
      organizationId,
    });
    const orgAdmin =
      !!organizationAccess &&
      isOrganizationAdminRole(resolveOrganizationRole(organizationAccess));
    for (const project of member.organization.projects) {
      await getProjectAccess.clear({ userId, projectId: project.id });
      const access = await getProjectAccess({ userId, projectId: project.id });
      lines.push({
        organizationId,
        userId,
        projectId: project.id,
        read: access !== null,
        write: canWriteProject(access),
        orgAdmin,
      });
    }
  }
  return sortLines(lines);
}

async function readLines(path: string): Promise<Map<string, AccessLine>> {
  const lines = (await Bun.file(path).json()) as AccessLine[];
  return new Map(lines.map((line) => [lineKey(line), line]));
}

async function diff(
  beforePath: string,
  afterPath: string,
  expectPath: string | undefined
): Promise<number> {
  const [before, after] = await Promise.all([
    readLines(beforePath),
    readLines(afterPath),
  ]);
  const expected = new Set<string>(
    expectPath ? ((await Bun.file(expectPath).json()) as string[]) : []
  );

  const differences: string[] = [];
  for (const [key, line] of before) {
    const other = after.get(key);
    if (!other) {
      differences.push(`removed  ${key}`);
      continue;
    }
    const changed = (['read', 'write', 'orgAdmin'] as const).filter(
      (field) => line[field] !== other[field]
    );
    if (changed.length > 0) {
      differences.push(
        `changed  ${key}  ${changed.map((field) => `${field}: ${line[field]} -> ${other[field]}`).join(', ')}`
      );
    }
  }
  for (const key of after.keys()) {
    if (!before.has(key)) {
      differences.push(`added    ${key}`);
    }
  }

  const unexpected = differences.filter(
    (line) => !expected.has(line.slice('changed  '.length).split('  ')[0] ?? '')
  );
  console.log(
    `${before.size} lines before, ${after.size} after, ${differences.length} differences, ${unexpected.length} unexpected`
  );
  for (const line of differences) {
    console.log(line);
  }
  return unexpected.length === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

if (args.includes('--diff')) {
  const index = args.indexOf('--diff');
  const beforePath = args[index + 1];
  const afterPath = args[index + 2];
  if (!(beforePath && afterPath)) {
    throw new Error('--diff needs two files');
  }
  process.exit(await diff(beforePath, afterPath, option('--expect')));
}

const evaluator = option('--evaluator') ?? 'current';
if (evaluator !== 'legacy' && evaluator !== 'current') {
  throw new Error(`Unknown evaluator: ${evaluator}`);
}
const lines =
  evaluator === 'legacy' ? await legacySnapshot() : await currentSnapshot();
console.log(JSON.stringify(lines, null, 2));
process.exit(0);
