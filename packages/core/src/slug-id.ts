// Slug-based primary-id generation for project/dashboard/organization rows.
// Needs @openpanel/db, so it stays out of shared/id.ts (the database-free id
// helpers). Postgres comes from the caller's scope (`deps.db`) so the requestId
// reaches the uniqueness probe; `deps` is narrowed to `Pick<ServiceDeps, 'db'>`
// because mcp's tool handlers have a fixed `@modelcontextprotocol/sdk` signature
// and only hold the db the route closed over.

import { slug } from '@openpanel/shared';
import type { ServiceDeps } from './services';

// Dashboard ids are global and names like "Overview" repeat across every
// organization, so the 4-digit suffix space of a popular name can fill up.
const SHORT_SUFFIX_DIGITS = 4;
const LONG_SUFFIX_DIGITS = 8;
const SHORT_SUFFIX_ATTEMPTS = 5;
const MAX_ATTEMPTS = 10;
const NUMERIC_SUFFIX = /-\d{4}$/;
// Session buffer keys are `session:{projectId}:{deviceId}` next to fixed
// `session:<segment>:…` keys, so a project id equal to a segment could write
// over another project's session state. The session keys are spread over the
// buffer and the session module, so slug-id.test.ts scans the source for them.
export const RESERVED_PROJECT_IDS = new Set([
  'end',
  'hwm',
  'profile',
  'projects',
  'reaper',
  'wallclock',
]);

function randomSuffix(digits: number): string {
  const lowest = 10 ** (digits - 1);
  return String(lowest + Math.floor(Math.random() * 9 * lowest));
}

export async function getId(
  deps: Pick<ServiceDeps, 'db'>,
  tableName: 'project' | 'dashboard' | 'organization',
  name: string
): Promise<string> {
  const db = deps.db;
  if (!db[tableName]) {
    throw new Error('Table does not exists');
  }

  if (!('findUnique' in db[tableName])) {
    throw new Error('findUnique does not exists');
  }

  const base = slug(name);
  const unsuffixedBase = base.replace(NUMERIC_SUFFIX, '');
  const isReserved = tableName === 'project' && RESERVED_PROJECT_IDS.has(base);
  for (let attempt = isReserved ? 1 : 0; attempt < MAX_ATTEMPTS; attempt++) {
    const digits =
      attempt <= SHORT_SUFFIX_ATTEMPTS
        ? SHORT_SUFFIX_DIGITS
        : LONG_SUFFIX_DIGITS;
    const candidate =
      attempt === 0 ? base : `${unsuffixedBase}-${randomSuffix(digits)}`;
    // @ts-expect-error
    const existing = await db[tableName].findUnique({
      where: { id: candidate },
    });
    if (!existing) {
      return candidate;
    }
  }

  throw new Error(`Could not generate a unique ${tableName} id`);
}
