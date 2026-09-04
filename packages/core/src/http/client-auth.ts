// Where API/SDK credentials become a client principal.
//
// V1 has five near-identical validators — `validateSdkRequest`,
// `validateExportRequest`, `validateImportRequest`, `validateManageRequest`
// and the MCP copy — that differ only by the accepted `ClientType` set and by
// the ingest extension. They collapse into this one function (ADR-011 A-i).
//
// M8-002 filled in the INGEST branch — `modules/ingest/src/client-auth.ts`
// holds V1's `validateSdkRequest` verbatim, and this file adapts it onto the
// principal. The `allow`-list tiers (`validateExportRequest`,
// `validateImportRequest`, `validateManageRequest`, MCP's `token: 'basic'`)
// are NOT filled in yet: they belong to the client module, not to ingest, and
// stay the stub that answers 401 — the same NAMED GAP every non-ingest
// `publicApiRoutes` module's header already records.

import type { AppDeps } from '../context';
import {
  type IngestHeaders,
  validateIngestRequest,
} from '../modules/ingest/src/client-auth';

/** Prisma's `ClientType` enum, by value. Moves to client.constants.ts in P7. */
export type ClientType = 'read' | 'write' | 'root';

export interface AuthenticatedClient {
  id: string;
  /** `null` for a root client, which is scoped to `organizationId` instead. */
  projectId: string | null;
  /** Every client — read/write/root alike — belongs to exactly one org. */
  organizationId: string;
  type: ClientType;
  /**
   * Whether a client secret was PRESENTED, set before it is verified — V1 sets
   * `req.clientSecretAuth` at parse time (utils/auth.ts:62-64) and `isBotHook`
   * reads it afterwards as "this is a server-side SDK, never a bot". The
   * side-channel survives as a field on the principal (ADR-011 A-i).
   */
  secretPresented: boolean;
}

export interface ClientAuthOptions {
  /** Which client types may pass. Omitted means any, as `validateSdkRequest`. */
  allow?: ClientType[];
  /** The ingest extension described above. */
  ingest?: boolean;
  /** MCP presents `base64(clientId:clientSecret)` instead of the two headers. */
  token?: 'basic';
}

/** What the ingest tier needs beyond the headers: V1 reads the attribution ip
 *  and the body (credential fallback, profile filter, `__revenue` gate). */
export interface ClientAuthRequest {
  ip: string;
  body: unknown;
}

export async function authenticateClient(
  _deps: AppDeps,
  headers: IngestHeaders,
  options: ClientAuthOptions,
  request?: ClientAuthRequest
): Promise<AuthenticatedClient | null> {
  if (!options.ingest) {
    return null;
  }

  const outcome = await validateIngestRequest({
    headers,
    clientIp: request?.ip,
    body: request?.body,
  });

  if (!outcome.ok) {
    return null;
  }

  const { client } = outcome;
  return {
    id: client.id,
    projectId: client.projectId,
    organizationId: client.organizationId,
    type: client.type,
    secretPresented: outcome.secretPresented,
  };
}
