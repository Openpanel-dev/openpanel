import type { FastifyReply, FastifyRequest } from 'fastify';

import { toDots } from '@openpanel/common';
import type { IClickhouseEvent } from '@openpanel/db';
import { ch, formatClickhouseDate, TABLE_NAMES } from '@openpanel/db';

export async function importEvents(
  request: FastifyRequest<{
    Body: IClickhouseEvent[];
  }>,
  reply: FastifyReply
) {
  const importedAt = formatClickhouseDate(new Date());
  const values: IClickhouseEvent[] = request.body.map((event) => {
    return {
      ...event,
      properties: toDots(event.properties),
      project_id: request.client?.projectId ?? '',
      created_at: formatClickhouseDate(event.created_at),
      imported_at: importedAt,
    };
  });

  try {
    const res = await ch.insert({
      table: TABLE_NAMES.events,
      values,
      format: 'JSONEachRow',
      clickhouse_settings: {
        date_time_input_format: 'best_effort',
      },
    });

    console.log(res.summary?.written_rows, 'events imported');
    reply.send('OK');
  } catch (e) {
    console.error(e);
    reply.status(500).send('Error');
  }
}
