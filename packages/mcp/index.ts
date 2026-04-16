export { createMcpServer } from './src/server';
export { SessionManager } from './src/session-manager';
export { authenticateToken, McpAuthError, extractToken } from './src/auth';
export { handleMcpGet, handleMcpPost } from './src/handler';
export type { McpAuthContext } from './src/auth';

// Reusable handler logic for the in-app chat (apps/api/src/chat/tools/).
// These are pure functions, transport-agnostic — they don't touch MCP at all.
export { runReport, runReportFromConfig } from './src/tools/analytics/reports';
