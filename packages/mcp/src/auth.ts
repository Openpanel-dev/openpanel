import { verifyPassword } from '@openpanel/common/server';
import { ClientType, getClientByIdCached } from '@openpanel/db';
import { getCache } from '@openpanel/redis';

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
  token: string | undefined,
): Promise<McpAuthContext> {
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
    throw new McpAuthError(
      'Invalid token format — expected base64(clientId:clientSecret)',
    );
  }

  const clientId = decoded.slice(0, colonIndex);
  const clientSecret = decoded.slice(colonIndex + 1);

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      clientId,
    )
  ) {
    throw new McpAuthError('Invalid client ID format');
  }

  if (!clientSecret) {
    throw new McpAuthError('Client secret is required');
  }

  const client = await getClientByIdCached(clientId);
  if (!client) {
    throw new McpAuthError('Invalid credentials');
  }

  if (!client.secret) {
    throw new McpAuthError(
      'This client has no secret — only clients with a secret can use MCP',
    );
  }

  if (client.type === ClientType.write) {
    throw new McpAuthError(
      'Write-only clients cannot use MCP — use a read or root client',
    );
  }

  const cacheKey = `mcp:auth:${clientId}:${Buffer.from(clientSecret).toString('base64')}`;
  const isVerified = await getCache(
    cacheKey,
    60 * 5,
    async () => await verifyPassword(clientSecret, client.secret!),
    true,
  );

  if (!isVerified) {
    throw new McpAuthError('Invalid credentials');
  }

  const isRoot = client.type === ClientType.root;

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
  authHeader: string | undefined,
): string | undefined {
  if (typeof query['token'] === 'string') {
    return query['token'];
  }
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return undefined;
}

/**
 * Resolve the effective projectId for a tool call.
 * For read clients the projectId is fixed; for root clients it must be supplied.
 */
export function resolveProjectId(
  context: McpAuthContext,
  inputProjectId: string | undefined,
): string {
  if (context.projectId !== null) {
    return context.projectId;
  }
  if (!inputProjectId) {
    throw new Error(
      'projectId is required when using a root (organization-level) client',
    );
  }
  return inputProjectId;
}
