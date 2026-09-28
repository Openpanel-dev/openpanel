// This route delegates its ClickHouse insert to import.service.ts's
// `insertRawEventsBatch`.
//
// `allow: ['read', 'root']`: a `write`-type client may not import.
//
// The body is typed but not shape-validated for this route.
//
// `client.projectId` is `null` for a root client, which is why the handler
// guards on it explicitly before importing.

import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import type { IClickhouseEvent } from '../event/event.service';
import { insertRawEventsBatch } from './import.service';

export const importRoutes = defineRoutes((app) =>
  app.post(
    '/import/events',
    async ({ body, client, ctx, status }) => {
      if (!client.projectId) {
        return status(400, 'Missing project id');
      }

      try {
        const { writtenRows } = await insertRawEventsBatch(
          ctx,
          client.projectId,
          body as IClickhouseEvent[]
        );
        ctx.logger.info({ writtenRows }, 'events imported');
        return 'OK';
      } catch (error) {
        ctx.logger.error({ err: error }, 'Failed to import events');
        return status(500, 'Error');
      }
    },
    {
      clientAuth: { allow: ['read', 'root'], label: 'Import' },
      body: z.array(z.unknown()),
      detail: {
        tags: ['Import'],
        description: 'Bulk import historical events.',
      },
    }
  )
);
