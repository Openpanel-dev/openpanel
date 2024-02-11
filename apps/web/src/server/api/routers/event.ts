import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { transformEvent } from '@/server/services/event.service';
import { z } from 'zod';

import type { IDBEvent } from '@mixan/db';
import { chQuery, createSqlBuilder } from '@mixan/db';

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
      const { sb, getSql } = createSqlBuilder();

      sb.limit = take;
      sb.offset = skip;
      sb.where.projectId = `project_id = '${projectId}'`;
      if (profileId) {
        sb.where.profileId = `profile_id = '${profileId}'`;
      }
      if (events?.length) {
        sb.where.name = `name IN (${events.map((e) => `'${e}'`).join(',')})`;
      }

      sb.orderBy.created_at = 'created_at DESC';

      return (await chQuery<IDBEvent>(getSql())).map(transformEvent);
    }),
});
