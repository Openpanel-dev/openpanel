// Every POST authenticates from scratch and gets its own ephemeral McpServer,
// so there is no session to store or close and no cross-instance stickiness.
// GET/SSE and DELETE are not supported. Tool handlers close over `deps` because
// the `@modelcontextprotocol/sdk` handler signature has no context parameter.

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ErrorCode,
  isJSONRPCNotification,
  isJSONRPCRequest,
  type JSONRPCMessage,
  RequestIdSchema,
} from '@modelcontextprotocol/sdk/types.js';
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

/**
 * Wire constants of the synthetic handshake. They are a contract with clients
 * of `/mcp`: `mcp.service.test.ts` pins them because bumping
 * `@modelcontextprotocol/sdk` does not bump them.
 */
const MCP_PROTOCOL_VERSION = '2024-11-05';
const MCP_PROXY_CLIENT_INFO = { name: 'mcp-proxy', version: '0' };
/** JSON-RPC id of the synthetic `initialize`; never leaves this process. */
const SYNTHETIC_INITIALIZE_ID = '__mcp_init__';

export interface McpHttpResult {
  status: number;
  body: unknown;
}

const INVALID_REQUEST_STATUS = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON-RPC `-32600`, echoing the caller's id when it is a legal one. */
function invalidRequest(body: unknown, message: string): McpHttpResult {
  const rawId = isRecord(body) ? body.id : undefined;
  const id = RequestIdSchema.safeParse(rawId).success ? rawId : null;
  return {
    status: INVALID_REQUEST_STATUS,
    body: {
      jsonrpc: '2.0',
      id,
      error: { code: ErrorCode.InvalidRequest, message },
    },
  };
}

/**
 * Handle one stateless MCP POST request. Auth failures resolve to a 401 result
 * rather than throwing, so callers need one catch block for everything else.
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

  // The SDK drops anything that is not a request or notification on the
  // floor via `Protocol.onerror` and never replies — a well-formed *response*
  // message included — so an unvalidated body left the HTTP request pending
  // forever. The gate has to sit here, before dispatch.
  if (!isRecord(body)) {
    return invalidRequest(body, 'Invalid Request: body must be a JSON object');
  }

  // Notifications carry no `id` and expect no response.
  if (isJSONRPCNotification(body)) {
    return { status: 202, body: null };
  }

  if (!isJSONRPCRequest(body)) {
    return invalidRequest(body, 'Invalid Request: not a JSON-RPC 2.0 request');
  }
  const message: JSONRPCMessage = body;

  logToolCall(deps, message, context);
  const isInitializeRequest =
    'method' in message && message.method === 'initialize';
  const start = Date.now();
  const response = await runOnEphemeralServer(
    { context, deps, dbJsonNull: deps.prisma.DbNull, services },
    message,
    isInitializeRequest
  );
  logToolResult(deps, message, response, start);

  return { status: 200, body: response };
}

/**
 * Every request gets a fresh McpServer over an in-memory transport pair. A
 * real `initialize` request completes the handshake directly; anything else
 * fast-forwards a synthetic handshake first, since a brand-new server has no
 * other way to reach its ready state.
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

  try {
    if (!isInitializeRequest) {
      await completeSyntheticHandshake(clientTransport);
    }

    return await new Promise<JSONRPCMessage>((resolve, reject) => {
      clientTransport.onmessage = resolve;
      // The SDK reports an undispatchable message here and nowhere else, so a
      // message that slips past the gate rejects instead of leaking a pending
      // HTTP request.
      server.server.onerror = reject;
      clientTransport.send(message).catch(reject);
    });
  } finally {
    // `server.close` closes `serverTransport`, and an InMemoryTransport closes its
    // linked peer, so one call tears down both ends and the SDK's response
    // handlers and abort controllers with them.
    await server.close();
  }
}

/**
 * Fast-forward a brand-new server to its ready state.
 *
 * ORDER-SENSITIVE: the `initialize` response and the `notifications/initialized`
 * that follows it must both be consumed here, before the caller installs the
 * real response resolver — otherwise the handshake's own traffic resolves the
 * caller's promise. It works because `InMemoryTransport` delivers synchronously
 * and the SDK sends nothing unsolicited.
 */
async function completeSyntheticHandshake(
  clientTransport: InMemoryTransport
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    clientTransport.onmessage = () => resolve();
    clientTransport
      .send({
        jsonrpc: '2.0',
        id: SYNTHETIC_INITIALIZE_ID,
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
