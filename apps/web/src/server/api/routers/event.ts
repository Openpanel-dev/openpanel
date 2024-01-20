import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db } from '@/server/db';
import { z } from 'zod';

import type { Event, Profile } from '@mixan/db';

function transformEvent(
  event: Event & {
    profile: Profile;
  }
) {
  return {
    ...event,
    properties: event.properties as Record<string, unknown>,
  };
}

export const eventRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        take: z.number().default(100),
        skip: z.number().default(0),
        profileId: z.string().optional(),
        events: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input: { take, skip, projectId, profileId, events } }) => {
      return db.event
        .findMany({
          take,
          skip,
          where: {
            project_id: projectId,
            profile_id: profileId,
            ...(events && events.length > 0
              ? {
                  name: {
                    in: events,
                  },
                }
              : {}),
          },
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            profile: true,
          },
        })
        .then((events) => events.map(transformEvent));
    }),
});
