// Slug-based primary-id generation for project/dashboard/organization rows.
// Moved from packages/db/src/services/id.service.ts (M8-005) — a sibling of
// shared/access-lookups.ts: needs @openpanel/db, so it stays out of
// shared/id.ts (the database-free id helpers).
//
// M10-009: Postgres comes from the caller's scope (`deps.db`), not a lazy
// `import('@openpanel/db/...')` — so the requestId minted at the edge reaches
// the uniqueness probe (ADR-018, docs/TECH_DEBT.md §4). `deps` is narrowed to
// `Pick<ServiceDeps, 'db'>` because mcp's tool handlers have a fixed
// `@modelcontextprotocol/sdk` signature and only ever hold the db the route
// closed over.

import { slug } from '@openpanel/shared';
import type { ServiceDeps } from './services';

export async function getId(
  deps: Pick<ServiceDeps, 'db'>,
  tableName: 'project' | 'dashboard' | 'organization',
  name: string
): Promise<string> {
  const newId = slug(name);
  const db = deps.db;
  if (!db[tableName]) {
    throw new Error('Table does not exists');
  }

  if (!('findUnique' in db[tableName])) {
    throw new Error('findUnique does not exists');
  }

  // @ts-expect-error
  const existingProject = await db[tableName].findUnique({
    where: {
      id: newId,
    },
  });

  function random(str: string) {
    const numbers = Math.floor(1000 + Math.random() * 9000);
    if (str.match(/-\d{4}$/g)) {
      return str.replace(/-\d{4}$/g, `-${numbers}`);
    }
    return `${str}-${numbers}`;
  }

  if (existingProject) {
    return getId(deps, tableName, random(name));
  }

  return newId;
}
