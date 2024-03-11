import type { RawRequestDefaultExpression } from 'fastify';

import { verifyPassword } from '@openpanel/common';
import { db } from '@openpanel/db';

export async function validateSdkRequest(
  headers: RawRequestDefaultExpression['headers']
): Promise<string> {
  const clientId = headers['openpanel-client-id'] as string;
  const clientSecret = headers['openpanel-client-secret'] as string;
  const origin = headers.origin;
  if (!clientId) {
    throw new Error('Misisng client id');
  }

  const client = await db.client.findUnique({
    where: {
      id: clientId,
    },
  });

  if (!client) {
    throw new Error('Invalid client id');
  }

  if (client.secret) {
    if (!(await verifyPassword(clientSecret || '', client.secret))) {
      throw new Error('Invalid client secret');
    }
  } else if (client.cors !== '*') {
    const domainAllowed = client.cors.split(',').find((domain) => {
      if (domain === origin) {
        return true;
      }
    });

    if (!domainAllowed) {
      throw new Error('Invalid cors settings');
    }
  }

  return client.project_id;
}
