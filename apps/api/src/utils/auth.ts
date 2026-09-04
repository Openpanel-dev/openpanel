import {
  type IngestAuthErrorPayload,
  validateIngestRequest,
  verifyPassword,
} from '@openpanel/core';
import type { IServiceClientWithProject } from '@openpanel/db';
import { ClientType, getClientByIdCached } from '@openpanel/db';
import type {
  DeprecatedPostEventPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyRequest, RawRequestDefaultExpression } from 'fastify';

// `validateSdkRequest` dissolved into @openpanel/core's ingest module
// (M8-002): the rules live in modules/ingest/src/client-auth.ts and this is
// the DELEGATE, kept so the Fastify hook keeps its signature and its
// `req.clientSecretAuth` side channel. The other three validators stay here —
// they belong to the client module, not to ingest, and no task has moved them.
//
// The error class stays HERE on purpose. core returns a refusal rather than
// throwing, so the stack trace is captured in this bundle chunk instead of in
// the ~11 MB core chunk whose ~20 MB source map `source-map-support` would
// then parse — ~1.2s, once, on the first failed ingest auth.
export class SdkAuthError extends Error {
  payload: IngestAuthErrorPayload;

  constructor(message: string, payload: IngestAuthErrorPayload) {
    super(message);
    this.name = 'SdkAuthError';
    this.message = message;
    this.payload = payload;
  }
}

export async function validateSdkRequest(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>
): Promise<IServiceClientWithProject> {
  const outcome = await validateIngestRequest({
    headers: req.headers,
    clientIp: req.clientIp,
    body: req.body,
  });

  // V1 set this at parse time, before validation could refuse — so it is set
  // on both branches.
  if (outcome.secretPresented) {
    req.clientSecretAuth = true;
  }

  if (!outcome.ok) {
    throw new SdkAuthError(outcome.message, outcome.payload);
  }

  return outcome.client;
}

export async function validateExportRequest(
  headers: RawRequestDefaultExpression['headers']
): Promise<IServiceClientWithProject> {
  const clientId = headers['openpanel-client-id'] as string;
  const clientSecret = (headers['openpanel-client-secret'] as string) || '';

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      clientId
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
  headers: RawRequestDefaultExpression['headers']
): Promise<IServiceClientWithProject> {
  const clientId = headers['openpanel-client-id'] as string;
  const clientSecret = (headers['openpanel-client-secret'] as string) || '';

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      clientId
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

export async function validateManageRequest(
  headers: RawRequestDefaultExpression['headers']
): Promise<IServiceClientWithProject> {
  const clientId = headers['openpanel-client-id'] as string;
  const clientSecret = (headers['openpanel-client-secret'] as string) || '';

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      clientId
    )
  ) {
    throw new Error('Manage: Client ID must be a valid UUIDv4');
  }

  const client = await getClientByIdCached(clientId);

  if (!client) {
    throw new Error('Manage: Invalid client id');
  }

  if (!client.secret) {
    throw new Error('Manage: Client has no secret');
  }

  if (client.type !== ClientType.root) {
    throw new Error(
      'Manage: Only root clients are allowed to manage resources'
    );
  }

  if (!(await verifyPassword(clientSecret, client.secret))) {
    throw new Error('Manage: Invalid client secret');
  }

  return client;
}
