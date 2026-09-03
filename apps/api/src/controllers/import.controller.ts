import { insertRawEventsBatch } from '@openpanel/core';
import type { IClickhouseEvent } from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Dissolved into @openpanel/core's import module (M5-004): the
// toDots/project_id/imported_at stamping and the ClickHouse insert moved to
// import.service.ts's `insertRawEventsBatch`. This controller stays
// (DELEGATE PATTERN) — it is the live Fastify handler, a thin wrapper
// resolving `request.client` and translating the result into a Fastify
// reply.
export async function importEvents(
  request: FastifyRequest<{
    Body: IClickhouseEvent[];
  }>,
  reply: FastifyReply
) {
  const projectId = request.client?.projectId;
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  try {
    const { writtenRows } = await insertRawEventsBatch(projectId, request.body);

    console.log(writtenRows, 'events imported');
    reply.send('OK');
  } catch (e) {
    console.error(e);
    reply.status(500).send('Error');
  }
}
