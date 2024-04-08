import type { RawRequestDefaultExpression } from 'fastify';

import { verifyPassword } from '@openpanel/common';
import { db } from '@openpanel/db';

import { logger } from './logger';

const cleanDomain = (domain: string) =>
  domain
    .replace('www.', '')
    .replace(/https?:\/\//, '')
    .replace(/\/$/, '');

export async function validateSdkRequest(
  headers: RawRequestDefaultExpression['headers']
): Promise<string> {
  const clientIdNew = headers['openpanel-client-id'] as string;
  const clientIdOld = headers['mixan-client-id'] as string;
  const clientSecretNew = headers['openpanel-client-secret'] as string;
  const clientSecretOld = headers['mixan-client-secret'] as string;
  const clientId = clientIdNew || clientIdOld;
  const clientSecret = clientSecretNew || clientSecretOld;

  const origin = headers.origin;
  if (!clientId) {
    logger.error(
      {
        clientId,
        clientSecret,
        origin,
        headers,
      },
      'validateSdkRequest: Missing client id'
    );
    throw new Error('Missing client id');
  }

  const client = await db.client.findUnique({
    where: {
      id: clientId,
    },
  });

  if (!client) {
    logger.error(
      {
        clientId,
        clientSecret,
        origin,
        headers,
      },
      'validateSdkRequest: Invalid client id'
    );
    throw new Error('Invalid client id');
  }

  if (client.secret) {
    if (!(await verifyPassword(clientSecret || '', client.secret))) {
      logger.error(
        {
          clientId,
          clientSecret,
          origin,
          headers,
        },
        'validateSdkRequest: Invalid client secret'
      );
      throw new Error('Invalid client secret');
    }
  } else if (client.cors !== '*') {
    const domainAllowed = client.cors.split(',').find((domain) => {
      if (cleanDomain(domain) === cleanDomain(origin || '')) {
        return true;
      }
    });

    if (!domainAllowed) {
      logger.error(
        {
          clientId,
          clientSecret,
          client,
          origin,
          headers,
        },
        'validateSdkRequest: Invalid cors settings'
      );
      throw new Error('Invalid cors settings');
    }
  }

  return client.projectId;
}
