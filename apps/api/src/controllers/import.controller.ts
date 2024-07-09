import type { FastifyReply, FastifyRequest } from 'fastify';
import { pathOr } from 'ramda';
import { v4 as uuid } from 'uuid';

import { toDots } from '@openpanel/common';
import type {
  IClickhouseEvent,
  IServiceCreateEventPayload,
} from '@openpanel/db';
import { ch, formatClickhouseDate } from '@openpanel/db';
import type { PostEventPayload } from '@openpanel/sdk';

export async function importEvents(
  request: FastifyRequest<{
    Body: IClickhouseEvent[];
  }>,
  reply: FastifyReply
) {
  console.log('HERE?!', request.body.length);

  const values: IClickhouseEvent[] = request.body.map((event) => {
    return {
      ...event,
      project_id: request.client?.projectId ?? '',
      created_at: formatClickhouseDate(event.created_at),
    };
  });

  const res = await ch.insert({
    table: 'events',
    values,
    format: 'JSONEachRow',
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
    },
  });

  reply.send('OK');
}
