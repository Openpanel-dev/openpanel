import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index';
import type { McpToolDeps } from './tools/shared';

const SERVER_NAME = 'OpenPanel';
const SERVER_VERSION = '1.0.0';

/**
 * Create a configured McpServer for one authenticated request. Tool handlers
 * close over `deps` because the SDK's handler signature has no context parameter.
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
