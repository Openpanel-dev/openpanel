import type { FastifyRequest, RawRequestDefaultExpression } from 'fastify';

import { verifyPassword } from '@openpanel/common/server';
import type { IServiceClientWithProject } from '@openpanel/db';
import { ClientType, getClientByIdCached } from '@openpanel/db';
import type { PostEventPayload, TrackHandlerPayload } from '@openpanel/sdk';
import type {
  IProjectFilterIp,
  IProjectFilterProfileId,
} from '@openpanel/validation';
import { path } from 'ramda';

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
    },
  ) {
    super(message);
    this.name = 'SdkAuthError';
    this.message = message;
    this.payload = payload;
  }
}

export async function validateSdkRequest(
  req: FastifyRequest<{
    Body: PostEventPayload | TrackHandlerPayload;
  }>,
): Promise<IServiceClientWithProject> {
  const { headers, clientIp } = req;
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
          ? `${clientSecret.slice(0, 5)}...${clientSecret.slice(-5)}`
          : 'none',
      origin,
    });

  if (!clientId) {
    throw createError('Ingestion: Missing client id');
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      clientId,
    )
  ) {
    throw createError('Ingestion: Clean ID must be a valid UUIDv4');
  }

  const client = await getClientByIdCached(clientId);

  if (!client) {
    throw createError('Ingestion: Invalid client id');
  }

  if (!client.project) {
    throw createError('Ingestion: Client has no project');
  }

  // Filter out blocked IPs
  const ipFilter = client.project.filters.filter(
    (filter): filter is IProjectFilterIp => filter.type === 'ip',
  );
  if (ipFilter.some((filter) => filter.ip === clientIp)) {
    throw createError('Ingestion: IP address is blocked by project filter');
  }

  // Filter out blocked profile ids
  const profileFilter = client.project.filters.filter(
    (filter): filter is IProjectFilterProfileId => filter.type === 'profile_id',
  );
  const profileId =
    path<string | undefined>(['payload', 'profileId'], req.body) || // Track handler
    path<string | undefined>(['profileId'], req.body); // Event handler

  if (profileFilter.some((filter) => filter.profileId === profileId)) {
    throw createError('Ingestion: Profile id is blocked by project filter');
  }

  if (client.project.cors) {
    const domainAllowed = client.project.cors.find((domain) => {
      const cleanedDomain = cleanDomain(domain);
      // support wildcard domains `*.foo.com`
      if (cleanedDomain.includes('*')) {
        const regex = new RegExp(
          `${cleanedDomain.replaceAll('.', '\\.').replaceAll('*', '.+?')}`,
        );

        return regex.test(origin || '');
      }

      if (cleanedDomain === cleanDomain(origin || '')) {
        return true;
      }
    });

    if (domainAllowed) {
      return client;
    }

    if (client.project.cors.includes('*') && origin) {
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
  headers: RawRequestDefaultExpression['headers'],
): Promise<IServiceClientWithProject> {
  const clientId = headers['openpanel-client-id'] as string;
  const clientSecret = (headers['openpanel-client-secret'] as string) || '';

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      clientId,
    )
  ) {
    throw new Error('Export: Client ID must be a valid UUIDv4');
  }

  const client = await getClientByIdCached(clientId);

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

export async function validateImportRequest(
  headers: RawRequestDefaultExpression['headers'],
): Promise<IServiceClientWithProject> {
  const clientId = headers['openpanel-client-id'] as string;
  const clientSecret = (headers['openpanel-client-secret'] as string) || '';

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      clientId,
    )
  ) {
    throw new Error('Import: Client ID must be a valid UUIDv4');
  }

  const client = await getClientByIdCached(clientId);

  if (!client) {
    throw new Error('Import: Invalid client id');
  }

  if (!client.secret) {
    throw new Error('Import: Client has no secret');
  }

  if (client.type === ClientType.write) {
    throw new Error('Import: Client is not allowed to import');
  }

  if (!(await verifyPassword(clientSecret, client.secret))) {
    throw new Error('Import: Invalid client secret');
  }

  return client;
}
