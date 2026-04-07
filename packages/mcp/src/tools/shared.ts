import { createLogger } from '@openpanel/logger';
import { z } from 'zod';
import type { McpAuthContext } from '../auth';

const logger = createLogger({ name: 'mcp' });

/**
 * Build the projectId portion of an input schema.
 *
 * - Root clients must supply a projectId per call (multi-project access).
 * - Read clients have it fixed in context — it's not included in the schema.
 */
export function projectIdSchema(context: McpAuthContext) {
  return context.projectId === null
    ? z
        .string()
        .describe(
          'Project ID to query (required for organization-level access)'
        )
    : z.string().optional();
}

/**
 * Resolve the effective projectId from context + optional tool input.
 */
export function resolveProjectId(
  context: McpAuthContext,
  inputProjectId: string | undefined
): string {
  if (context.projectId !== null) {
    return context.projectId;
  }
  if (!inputProjectId) {
    throw new Error(
      'projectId is required when using a root (organization-level) client'
    );
  }
  return inputProjectId;
}

/**
 * Zod schema for common date range inputs. Both fields are optional and
 * default to the last 30 days when omitted.
 */
export const zDateRange = {
  startDate: z
    .string()
    .optional()
    .describe(
      'Start date in YYYY-MM-DD format (e.g. 2024-01-01). Defaults to 30 days ago.'
    ),
  endDate: z
    .string()
    .optional()
    .describe(
      'End date in YYYY-MM-DD format (e.g. 2024-03-31). Defaults to today.'
    ),
};

/**
 * Resolve a date range, defaulting to the last 30 days if not provided.
 */
export function resolveDateRange(
  startDate?: string,
  endDate?: string
): { startDate: string; endDate: string } {
  const end = endDate ?? new Date().toISOString().slice(0, 10);
  const start =
    startDate ??
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

/**
 * Serialize a tool result to MCP content format.
 */
export function toText(data: unknown): {
  content: [{ type: 'text'; text: string }];
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Wrap a tool handler to catch errors and return them as MCP error content.
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const result = await fn();
    return toText(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`MCP tool error: ${message}`, { err });
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
}
