import type { FastifyReply, FastifyRequest } from 'fastify';

import { toDots } from '@openpanel/common';
import type { IClickhouseEvent } from '@openpanel/db';
import { TABLE_NAMES, ch, formatClickhouseDate } from '@openpanel/db';

export async function importEvents(
  request: FastifyRequest<{
    Body: IClickhouseEvent[];
  }>,
  reply: FastifyReply,
) {
  const projectId = request.client?.projectId;
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const importedAt = formatClickhouseDate(new Date());
  const values: IClickhouseEvent[] = request.body.map((event) => {
    return {
      ...event,
      properties: toDots(event.properties),
      project_id: projectId,
      created_at: formatClickhouseDate(event.created_at),
      imported_at: importedAt,
    };
  });

  try {
    const res = await ch.insert({
      table: TABLE_NAMES.events,
      values,
      format: 'JSONEachRow',
    });

    console.log(res.summary?.written_rows, 'events imported');
    reply.send('OK');
  } catch (e) {
    console.error(e);
    reply.status(500).send('Error');
  }
}
