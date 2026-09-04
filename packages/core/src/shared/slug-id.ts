// Slug-based primary-id generation for project/dashboard/organization rows.
// Moved from packages/db/src/services/id.service.ts (M8-005) — a sibling of
// shared/access-lookups.ts: needs @openpanel/db, so it stays out of
// shared/id.ts (the database-free id helpers).
//
// db access is LAZY (`loadDb` below), not a static top-level import — see
// insight.service.ts's header for the full reasoning (jobs.registry.ts and
// services.ts pull this module into the eager barrel chain nearly every core
// test file reaches, and constructing @openpanel/db's clients at import time
// would spawn a pino-pretty transport worker thread per test file).

import { slug } from '@openpanel/common';

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

export async function getId(
  tableName: 'project' | 'dashboard' | 'organization',
  name: string
): Promise<string> {
  const newId = slug(name);
  const db = await loadDb();
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
    return getId(tableName, random(name));
  }

  return newId;
}
