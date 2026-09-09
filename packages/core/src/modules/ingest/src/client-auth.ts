// The ingest tier of caller authentication (ADR-011 A-i's "ingest extension",
// ported verbatim from apps/api/src/utils/auth.ts's `validateSdkRequest`).
// apps/api's `clientHook` is a thin delegate over this; core's `clientAuth`
// macro reaches it through http/client-auth.ts when a route asks for
// `{ ingest: true }`.
//
// Everything here is behaviour V1 relies on and none of it is decoration: the
// `ignoreCorsAndSecret` short-circuit, the unanchored wildcard origin regex,
// CORS-before-secret ordering, the ip and profile_id project filters, the
// `__revenue` gate, the body-field credential fallback, the `mixan-*` header
// fallback (ADR-015 entry 5 is deferred, not taken) and the 5-minute verify
// cache whose key holds base64(<plaintext secret>) — a recorded finding
// ADR-011 leaves to Carl, not to a port.

import { getCache } from '@openpanel/redis';
import { path } from 'ramda';
import type { DbScope } from '../../../shared/cacheable-per-deps';
import { verifyPassword } from '../../../shared/crypto';
import {
  getClientByIdCached,
  type IServiceClientWithProject,
} from '../../client/client.service';
import type {
  IProjectFilterIp,
  IProjectFilterProfileId,
} from '../../project/project.constants';
import { headerValue, type IngestHeaders } from './headers';

export type { IngestHeaders } from './headers';

const CLIENT_ID_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERIFY_CACHE_SECONDS = 60 * 5;
const REDACTED_SECRET_EDGE_LENGTH = 5;
const DOMAIN_PROTOCOL = /https?:\/\//;
const DOMAIN_TRAILING_SLASH = /\/$/;
const DOMAIN_DOT = /\./g;
const DOMAIN_WILDCARD = /\*/g;

export interface IngestAuthErrorPayload {
  clientId?: string;
  clientSecret?: string;
  origin?: string;
}

/**
 * A refusal is RETURNED, never thrown.
 *
 * Two reasons. It keeps the transport in charge of its own status codes, as
 * `TrackOutcome` does. And it keeps the error OBJECT out of this bundle:
 * apps/api's dist splits core into one ~11 MB chunk with a ~20 MB source map,
 * and `source-map-support` parses that map the first time a stack trace
 * crosses it — measured at ~1.2s on the first failed ingest auth, on the hot
 * path, which the SDK wire contract catches as a phantom retry delay.
 * `SdkAuthError` is therefore constructed by the caller.
 */
export type IngestAuthOutcome =
  | {
      ok: true;
      client: IServiceClientWithProject;
      /**
       * Whether a client secret was PRESENTED, set before it is verified. V1
       * sets `req.clientSecretAuth` at parse time and the bot hook reads it
       * afterwards as "this is a server-side SDK, never a bot" — the side
       * channel survives as a field on the outcome (ADR-011 A-i).
       */
      secretPresented: boolean;
    }
  | {
      ok: false;
      message: string;
      payload: IngestAuthErrorPayload;
      secretPresented: boolean;
    };

const cleanDomain = (domain: string) =>
  domain
    .replace('www.', '')
    .replace(DOMAIN_PROTOCOL, '')
    .replace(DOMAIN_TRAILING_SLASH, '');

function isOriginAllowed(cors: string[], origin: string | undefined): boolean {
  const domainAllowed = cors.find((domain) => {
    const cleanedDomain = cleanDomain(domain);
    // support wildcard domains `*.foo.com`
    if (cleanedDomain.includes('*')) {
      const regex = new RegExp(
        `${cleanedDomain.replace(DOMAIN_DOT, '\\.').replace(DOMAIN_WILDCARD, '.+?')}`
      );

      return regex.test(origin || '');
    }

    return cleanedDomain === cleanDomain(origin || '');
  });

  if (domainAllowed) {
    return true;
  }

  return cors.includes('*') && !!origin;
}

export async function validateIngestRequest({
  deps,
  headers,
  clientIp,
  body,
}: {
  /** The scope the caller already holds — `getClientByIdCached`'s L1 is keyed
   *  on `deps.db`, so every ingest caller reads the one process instance. */
  deps: DbScope;
  headers: IngestHeaders;
  clientIp: string | undefined;
  body: unknown;
}): Promise<IngestAuthOutcome> {
  const clientIdNew = headerValue(headers, 'openpanel-client-id');
  const clientIdOld = headerValue(headers, 'mixan-client-id');
  const clientSecretNew = headerValue(headers, 'openpanel-client-secret');
  const clientSecretOld = headerValue(headers, 'mixan-client-secret');
  const clientIdFromBody = path<string | undefined>(['clientId'], body);
  const clientSecretFromBody = path<string | undefined>(['clientSecret'], body);
  const clientId = clientIdNew || clientIdOld || clientIdFromBody;
  const clientSecret =
    clientSecretNew || clientSecretOld || clientSecretFromBody;
  const origin = headerValue(headers, 'origin');
  const secretPresented = !!clientSecret;

  const refuse = (message: string): IngestAuthOutcome => ({
    ok: false,
    message,
    payload: {
      clientId,
      clientSecret:
        typeof clientSecret === 'string'
          ? `${clientSecret.slice(0, REDACTED_SECRET_EDGE_LENGTH)}...${clientSecret.slice(-REDACTED_SECRET_EDGE_LENGTH)}`
          : 'none',
      origin,
    },
    secretPresented,
  });

  if (!clientId) {
    return refuse('Ingestion: Missing client id');
  }

  if (!CLIENT_ID_UUID_REGEX.test(clientId)) {
    return refuse('Ingestion: Client ID must be a valid UUIDv4');
  }

  const client = await getClientByIdCached(deps, clientId);

  if (!client) {
    return refuse('Ingestion: Invalid client id');
  }

  if (!client.project) {
    return refuse('Ingestion: Client has no project');
  }

  // Filter out blocked IPs
  const ipFilter = client.project.filters.filter(
    (filter): filter is IProjectFilterIp => filter.type === 'ip'
  );
  if (ipFilter.some((filter) => filter.ip === clientIp)) {
    return refuse('Ingestion: IP address is blocked by project filter');
  }

  // Filter out blocked profile ids
  const profileFilter = client.project.filters.filter(
    (filter): filter is IProjectFilterProfileId => filter.type === 'profile_id'
  );
  const profileId =
    path<string | undefined>(['payload', 'profileId'], body) || // Track handler
    path<string | undefined>(['profileId'], body); // Event handler

  if (profileFilter.some((filter) => filter.profileId === profileId)) {
    return refuse('Ingestion: Profile id is blocked by project filter');
  }

  const revenue =
    path(['payload', 'properties', '__revenue'], body) ??
    path(['properties', '__revenue'], body);

  // Only allow revenue tracking if it was sent with a client secret
  // or if the project has allowUnsafeRevenueTracking enabled
  if (
    !(client.project.allowUnsafeRevenueTracking || clientSecret) &&
    typeof revenue !== 'undefined'
  ) {
    return refuse(
      'Ingestion: Revenue tracking is not allowed without a client secret'
    );
  }

  if (client.ignoreCorsAndSecret) {
    return { ok: true, client, secretPresented };
  }

  if (client.project.cors && isOriginAllowed(client.project.cors, origin)) {
    return { ok: true, client, secretPresented };
  }

  const secret = client.secret;
  if (secret && clientSecret) {
    const isVerified = await getCache(
      `client:auth:${clientId}:${Buffer.from(clientSecret).toString('base64')}`,
      VERIFY_CACHE_SECONDS,
      async () => await verifyPassword(clientSecret, secret),
      true
    );
    if (isVerified) {
      return { ok: true, client, secretPresented };
    }
  }

  return refuse('Ingestion: Invalid cors or secret');
}
