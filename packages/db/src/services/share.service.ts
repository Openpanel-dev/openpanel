import { db } from '../prisma-client';

export function getShareOverviewById(id: string) {
  return db.shareOverview.findFirst({
    where: {
      id,
    },
    include: {
      project: true,
    },
  });
}
