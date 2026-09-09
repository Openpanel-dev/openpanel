// Stateless-POST MCP transport (ADR-015 entry 2, M5-007). V1 kept a Redis
// session store (`mcp:session:<uuid>`, 30-min TTL) and a `Mcp-Session-Id`
// header that could stand in for the token on every request after the
// first — both removed here, along with GET/SSE (already an unconditional
// 405 — deletes nothing that ever worked) and DELETE. Every POST
// authenticates from scratch and gets its own ephemeral McpServer; nothing
// survives between requests, so there is no session to store, touch or
// close, and no cross-instance stickiness requirement.
//
// MCP is the one module the wave map allows to change its endpoint surface —
// every other module in this wave preserves its V1 contract byte-for-byte.
//
// M15-003: MCP is NOT a separate process and has no dependency builder of its
// own. `rest.routes.ts` mounts it with `.use(mcpRoutes(deps))`, so the route
// already holds the API's connections; this factory closes over them and
// hands them to `createMcpServer` per request (ADR-022 R6/R15, Carl's
// ruling). The `@modelcontextprotocol/sdk` tool-handler signature has no
// context parameter, which is a CLOSURE problem — solved by building the
// server where `deps` is in hand — not a context problem.

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { ServiceDeps, Services } from '../../services';
import {
  authenticateToken,
  extractToken,
  type McpAuthContext,
  McpAuthError,
} from './src/auth';
import { createMcpServer } from './src/server';
import type { McpToolDeps } from './src/tools/shared';

export type { McpAuthContext } from './src/auth';
export { extractToken, McpAuthError } from './src/auth';

const MCP_PROTOCOL_VERSION = '2024-11-05';
const MCP_PROXY_CLIENT_INFO = { name: 'mcp-proxy', version: '0' };

export interface McpHttpResult {
  status: number;
  body: unknown;
}

/**
 * `Prisma.DbNull` — the explicit-SQL-NULL sentinel `dashboard-management.ts`
 * writes onto a nullable Json column. A frozen CONSTANT, not a client and not
 * a service graph: nothing about it is per-request, and resolving it opens no
 * connection.
 *
 * It comes off `context.ts` because that is the ONE file in this package
 * `core-uses-ctx-not-db-internals` lets name `@openpanel/db`'s Prisma
 * namespace, and `ServiceDeps` has no field for it — the same door
 * `notification.service.ts`, `subscription.service.ts` and
 * `insight/src/store.ts` use for the same sentinel. The tool tree itself
 * reaches Postgres and ClickHouse through `deps`.
 */
function dbJsonNull(): Promise<unknown> {
  return import('../../context').then((m) =>
    m.prismaSentinels().then((prisma) => prisma.DbNull)
  );
}

/**
 * Handle one stateless MCP POST request end-to-end.
 *
 * Auth failures resolve to a 401 result rather than throwing, so the caller
 * (an HTTP framework's route handler) needs only one catch block for
 * everything else — matching the DELEGATE PATTERN's V1 controllers, which
 * keep framework-specific concerns (rate limiting, generic 500s) and hand
 * the protocol to this function.
 */
export async function handleStatelessMcpRequest(
  deps: ServiceDeps,
  services: Services,
  token: string | undefined,
  body: unknown
): Promise<McpHttpResult> {
  let context: McpAuthContext;
  try {
    context = await authenticateToken(deps, services, token);
  } catch (err) {
    if (err instanceof McpAuthError) {
      deps.logger.warn({ reason: err.message }, 'MCP auth failed');
      return { status: 401, body: { error: err.message } };
    }
    throw err;
  }

  const message = body as JSONRPCMessage;

  // Notifications carry no `id` and expect no response.
  if (!('id' in message)) {
    return { status: 202, body: null };
  }

  logToolCall(deps, message, context);
  const isInitializeRequest =
    'method' in message && message.method === 'initialize';
  const start = Date.now();
  const response = await runOnEphemeralServer(
    { context, deps, dbJsonNull: await dbJsonNull(), services },
    message,
    isInitializeRequest
  );
  logToolResult(deps, message, response, start);

  return { status: 200, body: response };
}

/**
 * Every request gets a fresh McpServer over an in-memory transport pair —
 * the ephemeral-server design already used to be per-session in V1; here it
 * is simply per-request, with nothing else changing. A real `initialize`
 * request completes the handshake directly; anything else fast-forwards a
 * synthetic handshake first, since a brand-new server has no other way to
 * reach its ready state.
 */
async function runOnEphemeralServer(
  tools: McpToolDeps,
  message: JSONRPCMessage,
  isInitializeRequest: boolean
): Promise<JSONRPCMessage> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createMcpServer(tools);
  await server.connect(serverTransport);

  if (!isInitializeRequest) {
    await new Promise<void>((resolve, reject) => {
      clientTransport.onmessage = () => resolve();
      clientTransport
        .send({
          jsonrpc: '2.0',
          id: '__mcp_init__',
          method: 'initialize',
          params: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: MCP_PROXY_CLIENT_INFO,
          },
        })
        .catch(reject);
    });
    // No response expected for this notification.
    await clientTransport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  }

  return await new Promise<JSONRPCMessage>((resolve, reject) => {
    clientTransport.onmessage = resolve;
    clientTransport.send(message).catch(reject);
  });
}

function logToolCall(
  deps: ServiceDeps,
  message: JSONRPCMessage,
  context: McpAuthContext
) {
  if (
    !(
      'method' in message &&
      message.method === 'tools/call' &&
      'params' in message
    )
  ) {
    return;
  }
  const { name, arguments: args } = (message.params ?? {}) as {
    name?: string;
    arguments?: unknown;
  };
  deps.logger.info(
    {
      tool: name,
      params: args,
      organizationId: context.organizationId,
      projectId: context.projectId,
      clientType: context.clientType,
    },
    'MCP tool call'
  );
}

function logToolResult(
  deps: ServiceDeps,
  message: JSONRPCMessage,
  response: JSONRPCMessage,
  start: number
) {
  if (!('method' in message && message.method === 'tools/call')) {
    return;
  }
  const { name } = (('params' in message && message.params) ?? {}) as {
    name?: string;
  };
  const isError =
    'result' in response && (response.result as { isError?: boolean })?.isError;
  deps.logger.info(
    { tool: name, durationMs: Date.now() - start, isError: isError ?? false },
    'MCP tool result'
  );
}

/**
 * The MCP tool tree reaches Postgres and ClickHouse through the `deps` this
 * factory closes over — there is no singleton and no "no context" path left
 * (ADR-022 R6). `extractToken` is pure and stays a bare re-export.
 */
export function createMcpService(deps: ServiceDeps, services: () => Services) {
  return {
    extractToken,
    handleStatelessMcpRequest: (
      token: string | undefined,
      body: unknown
    ): Promise<McpHttpResult> =>
      handleStatelessMcpRequest(deps, services(), token, body),
  };
}
