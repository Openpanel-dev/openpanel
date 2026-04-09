import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from './auth';
import { registerAllTools } from './tools/index';

const SERVER_NAME = 'OpenPanel';
const SERVER_VERSION = '1.0.0';

/**
 * Create a fully configured McpServer instance for a given auth context.
 *
 * Each authenticated session gets its own server instance with tools
 * pre-bound to the session's project/organization context.
 */
export function createMcpServer(context: McpAuthContext): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  registerAllTools(server, context);

  return server;
}
