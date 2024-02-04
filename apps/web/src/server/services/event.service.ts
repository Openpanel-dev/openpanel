import type { IDBEvent } from '@mixan/db';

import { db } from '../db';

export function transformEvent({ created_at, ...event }: IDBEvent) {
  return {
    ...event,
    profile: undefined,
    createdAt: new Date(created_at),
  };
}

export function getUniqueEvents({ projectId }: { projectId: string }) {
  return db.event.findMany({
    take: 500,
    distinct: ['name'],
    select: { name: true },
    where: {
      project_id: projectId,
    },
  });
}
