import { verifyPassword } from '@openpanel/common/server';
import type { IServiceClientWithProject } from '@openpanel/db';
import { ClientType, getClientByIdCached } from '@openpanel/db';
import { getCache } from '@openpanel/redis';
import type {
  DeprecatedPostEventPayload,
  IProjectFilterIp,
  IProjectFilterProfileId,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyRequest, RawRequestDefaultExpression } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
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
    }
  ) {
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
  const { headers, clientIp } = req;
  const clientIdNew = headers['openpanel-client-id'] as string;
  const clientIdOld = headers['mixan-client-id'] as string;
  const clientSecretNew = headers['openpanel-client-secret'] as string;
  const clientSecretOld = headers['mixan-client-secret'] as string;
  const clientIdFromBody = path<string | undefined>(['clientId'], req.body);
  const clientSecretFromBody = path<string | undefined>(
    ['clientSecret'],
    req.body
  );
  const clientId = clientIdNew || clientIdOld || clientIdFromBody;
  const clientSecret =
    clientSecretNew || clientSecretOld || clientSecretFromBody;
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
      clientId
    )
  ) {
    throw createError('Ingestion: Client ID must be a valid UUIDv4');
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
    (filter): filter is IProjectFilterIp => filter.type === 'ip'
  );
  if (ipFilter.some((filter) => filter.ip === clientIp)) {
    throw createError('Ingestion: IP address is blocked by project filter');
  }

  // Filter out blocked profile ids
  const profileFilter = client.project.filters.filter(
    (filter): filter is IProjectFilterProfileId => filter.type === 'profile_id'
  );
  const profileId =
    path<string | undefined>(['payload', 'profileId'], req.body) || // Track handler
    path<string | undefined>(['profileId'], req.body); // Event handler

  if (profileFilter.some((filter) => filter.profileId === profileId)) {
    throw createError('Ingestion: Profile id is blocked by project filter');
  }

  const revenue =
    path(['payload', 'properties', '__revenue'], req.body) ??
    path(['properties', '__revenue'], req.body);

  // Only allow revenue tracking if it was sent with a client secret
  // or if the project has allowUnsafeRevenueTracking enabled
  if (
    !(client.project.allowUnsafeRevenueTracking || clientSecret) &&
    typeof revenue !== 'undefined'
  ) {
    throw createError(
      'Ingestion: Revenue tracking is not allowed without a client secret'
    );
  }

  if (client.ignoreCorsAndSecret) {
    return client;
  }

  if (client.project.cors) {
    const domainAllowed = client.project.cors.find((domain) => {
      const cleanedDomain = cleanDomain(domain);
      // support wildcard domains `*.foo.com`
      if (cleanedDomain.includes('*')) {
        const regex = new RegExp(
          `${cleanedDomain.replaceAll('.', '\\.').replaceAll('*', '.+?')}`
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
    const isVerified = await getCache(
      `client:auth:${clientId}:${Buffer.from(clientSecret).toString('base64')}`,
      60 * 5,
      async () => await verifyPassword(clientSecret, client.secret!),
      true
    );
    if (isVerified) {
      return client;
    }
  }

  throw createError('Ingestion: Invalid cors or secret');
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

// ---------------------------------------------------------------------
// Admin-auth via OIDC JWT (opt-in)
//
// When `ADMIN_OIDC_ISSUER` is configured, /manage routes accept an
// `Authorization: Bearer <jwt>` header in addition to the existing
// `openpanel-client-id` / `openpanel-client-secret` Client-pair auth.
//
// The JWT is validated against the issuer's JWKS (discovered via the
// standard `/.well-known/openid-configuration` document). The token
// must carry the configured audience and a role claim that matches
// `ADMIN_OIDC_REQUIRED_ROLE` (defaults to `openpanel:admin`).
//
// Returns a synthesized Client-shaped record so the manage routes can
// scope authorization by `organizationId` without branching on auth
// source. `type` is `root` so existing controllers honor the
// permission model unchanged.
// ---------------------------------------------------------------------

const DEFAULT_REQUIRED_ROLE = 'openpanel:admin';

// Cache the resolved JWKS endpoint between requests so we hit the
// discovery doc once per process start.
let jwksCache:
  | {
      issuer: string;
      audience: string | undefined;
      jwks: ReturnType<typeof createRemoteJWKSet>;
    }
  | undefined;

interface AdminOidcConfig {
  issuer: string;
  audience: string | undefined;
  requiredRole: string;
  orgClaim: string;
}

function loadAdminOidcConfig(): AdminOidcConfig | undefined {
  const issuer = process.env.ADMIN_OIDC_ISSUER;
  if (!issuer) {
    return undefined;
  }
  return {
    issuer: issuer.replace(/\/$/, ''),
    audience: process.env.ADMIN_OIDC_AUDIENCE,
    requiredRole: process.env.ADMIN_OIDC_REQUIRED_ROLE ?? DEFAULT_REQUIRED_ROLE,
    // Zitadel emits the user's home Org under
    // `urn:zitadel:iam:user:resourceowner:id`; Keycloak / generic IdPs
    // typically use a custom claim such as `organization_id`. Operators
    // can override here.
    orgClaim:
      process.env.ADMIN_OIDC_ORG_CLAIM ??
      'urn:zitadel:iam:user:resourceowner:id',
  };
}

export function isAdminJwtAuthEnabled(): boolean {
  return loadAdminOidcConfig() !== undefined;
}

async function getJwks(config: AdminOidcConfig) {
  if (
    jwksCache &&
    jwksCache.issuer === config.issuer &&
    jwksCache.audience === config.audience
  ) {
    return jwksCache.jwks;
  }
  const discoveryUrl = new URL(
    '/.well-known/openid-configuration',
    config.issuer,
  );
  const discoveryRes = await fetch(discoveryUrl);
  if (!discoveryRes.ok) {
    throw new Error(
      `Admin OIDC: discovery fetch failed (${discoveryRes.status}) for ${discoveryUrl}`,
    );
  }
  const discovery = (await discoveryRes.json()) as { jwks_uri?: string };
  if (!discovery.jwks_uri) {
    throw new Error('Admin OIDC: discovery doc missing jwks_uri');
  }
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), {
    cooldownDuration: 60_000,
    cacheMaxAge: 10 * 60_000,
  });
  jwksCache = { issuer: config.issuer, audience: config.audience, jwks };
  return jwks;
}

function extractBearer(headers: RawRequestDefaultExpression['headers']) {
  const auth = headers.authorization;
  if (typeof auth !== 'string') return undefined;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

// Look for a string equal to `role` anywhere reasonable in the claims —
// supports plain `roles: ['openpanel:admin']`, Zitadel's nested
// `urn:zitadel:iam:org:project:roles: { 'openpanel:admin': {...} }`
// shape, and `scope: 'openid openpanel:admin'`.
function claimHasRole(payload: Record<string, unknown>, role: string): boolean {
  const zitadelRoles = payload['urn:zitadel:iam:org:project:roles'];
  if (zitadelRoles && typeof zitadelRoles === 'object') {
    if (role in (zitadelRoles as Record<string, unknown>)) return true;
  }
  const roles = payload.roles;
  if (Array.isArray(roles) && roles.includes(role)) return true;
  const scope = payload.scope;
  if (typeof scope === 'string' && scope.split(/\s+/).includes(role)) {
    return true;
  }
  return false;
}

// Synthesizes a Client-shaped record from a verified admin JWT so
// existing /manage controllers can pull `organizationId` off
// `request.client` without branching on auth source. The synthesized
// client is `type: 'root'`, `secret: null`, and is NEVER persisted —
// it lives only for the lifetime of the request.
function synthesizeAdminClient(
  organizationId: string,
  subject: string,
): IServiceClientWithProject {
  return {
    id: `jwt:${subject}`,
    name: `admin-jwt:${subject}`,
    type: ClientType.root,
    organizationId,
    projectId: null,
    cors: null,
    secret: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    // Project relation isn't used by /manage routes (root clients
    // scope at org level); satisfy the typing with null and rely on
    // controllers' projectId-from-body/query path.
    project: null as unknown as IServiceClientWithProject['project'],
  };
}

export async function validateAdminJwtRequest(
  headers: RawRequestDefaultExpression['headers'],
): Promise<IServiceClientWithProject> {
  const config = loadAdminOidcConfig();
  if (!config) {
    throw new Error('Admin OIDC auth is not configured');
  }
  const token = extractBearer(headers);
  if (!token) {
    throw new Error('Admin OIDC: Authorization header missing or malformed');
  }

  const jwks = await getJwks(config);
  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    issuer: config.issuer,
  };
  if (config.audience) {
    verifyOptions.audience = config.audience;
  }

  const { payload } = await jwtVerify(token, jwks, verifyOptions);

  if (!claimHasRole(payload as Record<string, unknown>, config.requiredRole)) {
    throw new Error(`Admin OIDC: token lacks required role ${config.requiredRole}`);
  }

  const orgId = (payload as Record<string, unknown>)[config.orgClaim];
  if (typeof orgId !== 'string' || orgId.length === 0) {
    throw new Error(
      `Admin OIDC: token missing organization claim "${config.orgClaim}"`,
    );
  }
  const subject = typeof payload.sub === 'string' ? payload.sub : 'unknown';

  return synthesizeAdminClient(orgId, subject);
}

/**
 * Wrapper for /manage routes. Dispatches to JWT-bearer auth when
 * `ADMIN_OIDC_ISSUER` is configured AND the request carries an
 * `Authorization: Bearer …` header; otherwise falls back to the
 * existing `openpanel-client-id` / `openpanel-client-secret` flow.
 *
 * Returns a Client-shaped record in both cases, so callers in
 * controllers (`request.client!.organizationId`, etc.) work without
 * branching.
 */
export async function validateAdminRequest(
  headers: RawRequestDefaultExpression['headers'],
): Promise<IServiceClientWithProject> {
  const bearer = extractBearer(headers);
  if (bearer && isAdminJwtAuthEnabled()) {
    return validateAdminJwtRequest(headers);
  }
  return validateManageRequest(headers);
}
