import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index';
import type { McpToolDeps } from './tools/shared';

const SERVER_NAME = 'OpenPanel';
const SERVER_VERSION = '1.0.0';

/**
 * Create a fully configured McpServer for one authenticated request.
 *
 * The API owns every connection (R15, Carl's ruling): the server is
 * bootstrapped from the `deps` `mcp.routes.ts` already holds, and each tool
 * handler CLOSES OVER them — the SDK's tool-handler signature has no context
 * parameter, which is a closure problem, not a context problem.
 */
export function createMcpServer(tools: McpToolDeps): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerAllTools(server, tools);

  return server;
}
