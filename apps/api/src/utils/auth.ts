import type { RawRequestDefaultExpression } from 'fastify';
import jwt from 'jsonwebtoken';

import { verifyPassword } from '@openpanel/common';
import type { Client, IServiceClient } from '@openpanel/db';
import { ClientType, db } from '@openpanel/db';

const cleanDomain = (domain: string) =>
  domain
    .replace('www.', '')
    .replace(/https?:\/\//, '')
    .replace(/\/$/, '');

export class SdkAuthError extends Error {
  payload: {
    clientId?: string;
    clientSecret?: string;
    origin?: string;
  };

  constructor(
    message: string,
    payload: {
      clientId?: string;
      clientSecret?: string;
      origin?: string;
    }
  ) {
    super(message);
    this.name = 'SdkAuthError';
    this.payload = payload;
  }
}

export async function validateSdkRequest(
  headers: RawRequestDefaultExpression['headers']
): Promise<Client> {
  const clientIdNew = headers['openpanel-client-id'] as string;
  const clientIdOld = headers['mixan-client-id'] as string;
  const clientSecretNew = headers['openpanel-client-secret'] as string;
  const clientSecretOld = headers['mixan-client-secret'] as string;
  const clientId = clientIdNew || clientIdOld;
  const clientSecret = clientSecretNew || clientSecretOld;
  const origin = headers.origin;

  const createError = (message: string) =>
    new SdkAuthError(message, {
      clientId,
      clientSecret:
        typeof clientSecret === 'string'
          ? clientSecret.slice(0, 5) + '...' + clientSecret.slice(-5)
          : 'none',
      origin,
    });

  if (!clientId) {
    throw createError('Ingestion: Missing client id');
  }

  const client = await db.client
    .findUnique({
      where: {
        id: clientId,
      },
    })
    .catch(() => null);

  if (!client) {
    throw createError('Ingestion: Invalid client id');
  }

  if (!client.projectId) {
    throw createError('Ingestion: Client has no project');
  }

  if (client.cors) {
    const domainAllowed = client.cors.split(',').find((domain) => {
      if (cleanDomain(domain) === cleanDomain(origin || '')) {
        return true;
      }
    });

    if (domainAllowed) {
      return client;
    }

    if (client.cors === '*' && origin) {
      return client;
    }
  }

  if (client.secret && clientSecret) {
    if (await verifyPassword(clientSecret, client.secret)) {
      return client;
    }
  }

  throw createError('Ingestion: Invalid cors or secret');
}

export async function validateExportRequest(
  headers: RawRequestDefaultExpression['headers']
): Promise<IServiceClient> {
  const clientId = headers['openpanel-client-id'] as string;
  const clientSecret = (headers['openpanel-client-secret'] as string) || '';
  const client = await db.client.findUnique({
    where: {
      id: clientId,
    },
  });

  if (!client) {
    throw new Error('Export: Invalid client id');
  }

  if (!client.secret) {
    throw new Error('Export: Client has no secret');
  }

  if (client.type === ClientType.write) {
    throw new Error('Export: Client is not allowed to export');
  }

  if (!(await verifyPassword(clientSecret, client.secret))) {
    throw new Error('Export: Invalid client secret');
  }

  return client;
}

export function validateClerkJwt(token?: string) {
  if (!token) {
    return null;
  }
  try {
    const decoded = jwt.verify(
      token,
      process.env.CLERK_PUBLIC_PEM_KEY!.replace(/\\n/g, '\n')
    );

    if (typeof decoded === 'object') {
      return decoded;
    }
  } catch (e) {
    //
  }

  return null;
}
