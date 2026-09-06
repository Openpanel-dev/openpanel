// Where API/SDK credentials become a client principal.
//
// V1 has five near-identical validators — `validateSdkRequest`,
// `validateExportRequest`, `validateImportRequest`, `validateManageRequest`
// and the MCP copy — that differ only by the accepted `ClientType` set and by
// the ingest extension. They collapse into this one function (ADR-011 A-i).
//
// M8-002 filled in the INGEST branch — `modules/ingest/src/client-auth.ts`
// holds V1's `validateSdkRequest` verbatim, and this file adapts it onto the
// principal. M9-004 filled in the `allow`-list tier, which is the one V1
// spells three times (`validateExportRequest`, `validateImportRequest`,
// `validateManageRequest`): identical bodies differing only by the accepted
// `ClientType` set and by the prefix on their error strings. `allow` carries
// that difference and the three collapse into `authenticateAllowedClient`
// below. MCP is NOT here — it authenticates its own `token` form inside
// `modules/mcp/src/auth.ts`, exactly as V1's mcp router did.

import type { AppDeps } from '../context';
import {
  type IngestHeaders,
  validateIngestRequest,
} from '../modules/ingest/src/client-auth';
import { headerValue } from '../modules/ingest/src/headers';
import { verifyPassword } from '../shared/crypto';
// M10-004: `getClientByIdCached`'s L1 LRU now lives inside
// `createClientService(deps)` (see that file's header), reached here through
// the v1-compat singleton, exactly as `modules/ingest/src/client-auth.ts`
// does — no cycle for THIS file (nothing under `modules/*.service.ts`
// imports `http/**`), so the import stays static.
import { getClientByIdCached } from '../v1-compat';

/** V1 refuses a client id that is not a UUID before it ever queries
 *  (utils/auth.ts's three validators). Same regex, same order. */
const CLIENT_ID_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLIENT_ID_HEADER = 'openpanel-client-id';
const CLIENT_SECRET_HEADER = 'openpanel-client-secret';

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

/**
 * The surface's name in a refusal message. V1's three validators are the same
 * function with a different prefix — `Export: Invalid client secret` — and
 * those strings are the 401 BODY on `/export`, `/insights`, `/import` and
 * `/manage`, so they are a wire contract, not decoration.
 */
export type ClientAuthLabel = 'Export' | 'Import' | 'Manage';

export interface ClientAuthOptions {
  /** Which client types may pass. Omitted means any, as `validateSdkRequest`. */
  allow?: ClientType[];
  /** Which of V1's three validators this route was served by. */
  label?: ClientAuthLabel;
  /** The ingest extension described above. */
  ingest?: boolean;
  /** MCP presents `base64(clientId:clientSecret)` instead of the two headers. */
  token?: 'basic';
}

/**
 * A refusal is returned, never thrown — same reason
 * `modules/ingest/src/client-auth.ts` gives, and it keeps the two 401 BODIES
 * V1 has (plain text on the ingest routes, `{error, message}` JSON on the
 * allow-list ones) a decision of the macro rather than of this function.
 */
export type ClientAuthResult =
  | { ok: true; client: AuthenticatedClient }
  | { ok: false; ingest: boolean; message: string };

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
): Promise<ClientAuthResult> {
  if (!options.ingest) {
    return await authenticateAllowedClient(headers, options);
  }

  const outcome = await validateIngestRequest({
    headers,
    clientIp: request?.ip,
    body: request?.body,
  });

  if (!outcome.ok) {
    return { ok: false, ingest: true, message: outcome.message };
  }

  const { client } = outcome;
  return {
    ok: true,
    client: {
      id: client.id,
      projectId: client.projectId,
      organizationId: client.organizationId,
      type: client.type,
      secretPresented: outcome.secretPresented,
    },
  };
}

/** V1's per-validator "wrong type" message; every other refusal differs only
 *  by the label prefix. */
const FORBIDDEN_TYPE_MESSAGE: Record<ClientAuthLabel, string> = {
  Export: 'Export: Client is not allowed to export',
  Import: 'Import: Client is not allowed to import',
  Manage: 'Manage: Only root clients are allowed to manage resources',
};

/** V1 mapped a Prisma lookup failure onto its own message, unprefixed. */
const MALFORMED_CLIENT_ID_MESSAGE = 'Client ID seems to be malformed';
const PRISMA_KNOWN_REQUEST_ERROR = 'PrismaClientKnownRequestError';
const UNEXPECTED_MESSAGE = 'Unexpected error';

/**
 * The `allow`-list tier: V1's `validateExportRequest` / `validateImportRequest`
 * / `validateManageRequest`, which differ only by the accepted `ClientType`
 * set and by the label their messages carry.
 *
 * `secretPresented` is true on success by construction: this tier verifies the
 * secret, so reaching the return means one was presented and matched.
 */
async function authenticateAllowedClient(
  headers: IngestHeaders,
  options: ClientAuthOptions
): Promise<ClientAuthResult> {
  const label = options.label ?? 'Export';
  const refuse = (message: string): ClientAuthResult => ({
    ok: false,
    ingest: false,
    message,
  });

  const clientId = headerValue(headers, CLIENT_ID_HEADER) ?? '';
  const clientSecret = headerValue(headers, CLIENT_SECRET_HEADER) ?? '';

  if (!CLIENT_ID_UUID_REGEX.test(clientId)) {
    return refuse(`${label}: Client ID must be a valid UUIDv4`);
  }

  try {
    const client = await getClientByIdCached(clientId);
    if (!client) {
      return refuse(`${label}: Invalid client id`);
    }
    if (!client.secret) {
      return refuse(`${label}: Client has no secret`);
    }
    if (options.allow && !options.allow.includes(client.type as ClientType)) {
      return refuse(FORBIDDEN_TYPE_MESSAGE[label]);
    }
    if (!(await verifyPassword(clientSecret, client.secret))) {
      return refuse(`${label}: Invalid client secret`);
    }

    return {
      ok: true,
      client: {
        id: client.id,
        projectId: client.projectId,
        organizationId: client.organizationId,
        type: client.type as ClientType,
        secretPresented: true,
      },
    };
  } catch (error) {
    return refuse(
      (error as { name?: string })?.name === PRISMA_KNOWN_REQUEST_ERROR
        ? MALFORMED_CLIENT_ID_MESSAGE
        : UNEXPECTED_MESSAGE
    );
  }
}
