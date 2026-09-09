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
// M10-004: `createMcpService(deps)` lands here, which means THIS FILE is now
// statically imported by services.ts. `./src/server`'s `registerAllTools`
// pulls in ~20 tool files that reach this package's own barrel
// (`@openpanel/core`) for cross-module functions, so it stays behind a lazy
// loader — a static top-level import would make services.ts's own module
// evaluation re-enter that barrel mid-evaluation, the exact TDZ hazard
// index.ts's header used to document for this file before it was reached
// only through a dynamic import. `./src/auth` stays a plain static import:
// `extractToken` is synchronous today (`mcp.routes.ts` doesn't await it) and
// auth.ts no longer reaches the barrel at its own top level (M10-004, see
// that file's header) — nothing left to make lazy. `deps` is unused:
// `handleStatelessMcpRequest`'s signature is a hard contract (its own tests
// call it with none) and its tool tree already reaches Postgres/ClickHouse
// through the v1-compat singleton, the same way every other bare, no-`Ctx`
// caller in this wave does.

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../../clients/logger';
import type { ServiceDeps, Services } from '../../services';
import {
  authenticateToken,
  extractToken,
  type McpAuthContext,
  McpAuthError,
} from './src/auth';

export type { McpAuthContext } from './src/auth';
export { extractToken, McpAuthError } from './src/auth';

let _server: Promise<typeof import('./src/server')> | undefined;
function loadServer() {
  if (!_server) {
    _server = import('./src/server');
  }
  return _server;
}

const logger = createLogger({ name: 'mcp' });

const MCP_PROTOCOL_VERSION = '2024-11-05';
const MCP_PROXY_CLIENT_INFO = { name: 'mcp-proxy', version: '0' };

export interface McpHttpResult {
  status: number;
  body: unknown;
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
  token: string | undefined,
  body: unknown
): Promise<McpHttpResult> {
  let context: McpAuthContext;
  try {
    context = await authenticateToken(token);
  } catch (err) {
    if (err instanceof McpAuthError) {
      logger.warn({ reason: err.message }, 'MCP auth failed');
      return { status: 401, body: { error: err.message } };
    }
    throw err;
  }

  const message = body as JSONRPCMessage;

  // Notifications carry no `id` and expect no response.
  if (!('id' in message)) {
    return { status: 202, body: null };
  }

  logToolCall(message, context);
  const isInitializeRequest =
    'method' in message && message.method === 'initialize';
  const start = Date.now();
  const response = await runOnEphemeralServer(
    context,
    message,
    isInitializeRequest
  );
  logToolResult(message, response, start);

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
  context: McpAuthContext,
  message: JSONRPCMessage,
  isInitializeRequest: boolean
): Promise<JSONRPCMessage> {
  const { createMcpServer } = await loadServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createMcpServer(context);
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

function logToolCall(message: JSONRPCMessage, context: McpAuthContext) {
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
  logger.info(
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
  logger.info(
    { tool: name, durationMs: Date.now() - start, isError: isError ?? false },
    'MCP tool result'
  );
}

/**
 * Ignores BOTH arguments, and takes them only because ADR-022 R3 keeps the
 * composition root a flat list: `extractToken` is pure and
 * `handleStatelessMcpRequest` hands the request to the
 * `@modelcontextprotocol/sdk` server, whose tool handlers have a fixed
 * signature with no room for a `deps` argument (docs/TECH_DEBT.md's
 * "loaders still standing" table).
 */
export function createMcpService(
  _deps: ServiceDeps,
  _services: () => Services
) {
  return {
    extractToken,
    handleStatelessMcpRequest,
  };
}
