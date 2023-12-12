import { db } from '../db';

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
