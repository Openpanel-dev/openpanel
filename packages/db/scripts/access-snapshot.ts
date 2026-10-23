// Dumps what every member may do on every project of their organization, so a
// data migration can be proven access-neutral: snapshot before, migrate,
// snapshot after, diff.
//
//   bun run --filter @openpanel/db access-snapshot --evaluator legacy  > before.json
//   bun run --filter @openpanel/db access-snapshot --evaluator current > after.json
//   bun run --filter @openpanel/db access-snapshot --diff before.json after.json [--expect keys.json]
//
// `legacy` is the rule the previous build applied, spelled out here so it
// keeps answering after the app has moved on: both role spellings, scope and
// `member_projects`. Run it before a migration and `current` after. `current`
// goes through core's public lookups, the same code every procedure calls,
// with each cache entry cleared first.

import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/core';
import {
  isOrganizationAdminRole,
  normalizeOrganizationRole,
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

const LEGACY_ADMIN_ROLES = new Set(['org:admin', 'admin', 'owner']);
const LEGACY_READ_ONLY_ROLE = 'viewer';

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
      projectScope: true,
      projects: { select: { projectId: true, level: true } },
      organization: {
        select: { projects: { select: { id: true } } },
      },
    },
  });
}

async function legacySnapshot(): Promise<AccessLine[]> {
  const members = await loadMembers();
  const lines: AccessLine[] = [];
  for (const member of members) {
    const isReadOnly = member.role === LEGACY_READ_ONLY_ROLE;
    const orgAdmin = LEGACY_ADMIN_ROLES.has(member.role);
    for (const project of member.organization.projects) {
      const grant = member.projects.find((row) => row.projectId === project.id);
      const read = member.projectScope === 'all' || grant !== undefined;
      lines.push({
        organizationId: member.organizationId,
        userId: member.userId as string,
        projectId: project.id,
        read,
        write: read && !isReadOnly && grant?.level !== 'read',
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
      isOrganizationAdminRole(
        normalizeOrganizationRole(organizationAccess.role)
      );
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

  const differences: { key: string; text: string }[] = [];
  for (const [key, line] of before) {
    const other = after.get(key);
    if (!other) {
      differences.push({ key, text: `removed  ${key}` });
      continue;
    }
    const changed = (['read', 'write', 'orgAdmin'] as const).filter(
      (field) => line[field] !== other[field]
    );
    if (changed.length > 0) {
      const detail = changed
        .map((field) => `${field}: ${line[field]} -> ${other[field]}`)
        .join(', ');
      differences.push({ key, text: `changed  ${key}  ${detail}` });
    }
  }
  for (const key of after.keys()) {
    if (!before.has(key)) {
      differences.push({ key, text: `added    ${key}` });
    }
  }

  const unexpected = differences.filter(
    (difference) => !expected.has(difference.key)
  );
  console.log(
    `${before.size} lines before, ${after.size} after, ${differences.length} differences, ${unexpected.length} unexpected`
  );
  for (const difference of differences) {
    console.log(difference.text);
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
