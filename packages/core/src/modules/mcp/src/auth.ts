import { createHash } from 'node:crypto';
import { getCache } from '@openpanel/redis';
import type { ServiceDeps, Services } from '../../../services';
import { verifyClientSecret } from '../../../shared/client-secret';

export interface McpAuthContext {
  /**
   * Fixed project ID for read clients.
   * null for root clients — they can query any project in their organization.
   */
  projectId: string | null;
  organizationId: string;
  clientType: 'read' | 'root';
}

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpAuthError';
  }
}

/**
 * Authenticate an MCP token.
 *
 * Token format: base64(clientId:clientSecret)
 * Accepted via ?token= query param or Authorization: Bearer header.
 *
 * - write-only clients are rejected (no read access)
 * - read clients get a fixed projectId
 * - root clients get null projectId + organizationId (multi-project access)
 */
export async function authenticateToken(
  deps: ServiceDeps,
  services: Services,
  token: string | undefined
): Promise<McpAuthContext> {
  const logger = deps.logger;
  if (!token) {
    throw new McpAuthError('Missing authentication token');
  }

  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf-8');
  } catch {
    throw new McpAuthError('Invalid token encoding');
  }

  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    logger.warn(
      { decodedLength: decoded.length },
      'MCP auth: token has no colon separator'
    );
    throw new McpAuthError(
      'Invalid token format — expected base64(clientId:clientSecret)'
    );
  }

  const clientId = decoded.slice(0, colonIndex);
  const clientSecret = decoded.slice(colonIndex + 1);

  logger.info(
    { clientId, secretPrefix: clientSecret.slice(0, 6) },
    'MCP auth: decoded token'
  );

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      clientId
    )
  ) {
    logger.warn({ clientId }, 'MCP auth: invalid client ID format');
    throw new McpAuthError('Invalid client ID format');
  }

  if (!clientSecret) {
    throw new McpAuthError('Client secret is required');
  }

  const client = await services.client.getClientByIdCached(clientId);
  if (!client) {
    logger.warn({ clientId }, 'MCP auth: client not found');
    throw new McpAuthError('Invalid credentials');
  }

  logger.info(
    { clientId, type: client.type, hasSecret: !!client.secret },
    'MCP auth: client found'
  );

  if (!client.secret) {
    throw new McpAuthError(
      'This client has no secret — only clients with a secret can use MCP'
    );
  }

  if (client.type === 'write') {
    logger.warn({ clientId }, 'MCP auth: write-only client rejected');
    throw new McpAuthError(
      'Write-only clients cannot use MCP — use a read or root client'
    );
  }

  const secretHash = createHash('sha256')
    .update(clientSecret)
    .digest('hex')
    .slice(0, 16);
  const cacheKey = `mcp:auth:${clientId}:${secretHash}`;
  const isVerified = await getCache(
    cacheKey,
    60 * 5,
    async () => await verifyClientSecret(clientSecret, client.secret!),
    true
  );

  logger.info(
    { clientId, isVerified },
    'MCP auth: password verification result'
  );

  if (!isVerified) {
    throw new McpAuthError('Invalid credentials');
  }

  const isRoot = client.type === 'root';

  return {
    projectId: isRoot ? null : (client.projectId ?? null),
    organizationId: client.organizationId,
    clientType: isRoot ? 'root' : 'read',
  };
}

/**
 * Extract the MCP token from a request.
 * Checks ?token= query param first, then Authorization: Bearer header.
 */
export function extractToken(
  query: Record<string, unknown>,
  authHeader: string | undefined
): string | undefined {
  if (typeof query['token'] === 'string') {
    return query['token'];
  }
  // RFC 7235: the auth scheme is case-insensitive.
  const [scheme, value] = (authHeader ?? '').split(' ');
  if (scheme?.toLowerCase() === 'bearer' && value) {
    return value;
  }
  return undefined;
}
